"""
Teach the model Hinglish intents with LoRA (a small add-on), then merge the add-on into a full model.

Needs a GPU (a free Google Colab T4 works).

  python train_lora.py --base ./Sent_model --data ./data --out ./Sent_model_hinglish --ckpt ./checkpoints

SAFE TO STOP AND RE-RUN: progress is saved to --ckpt every 50 steps, and a re-run continues from the last saved step.
If --out already holds a finished model, the script does nothing.

Input : data/train.jsonl and data/val.jsonl (chat format: system, user, assistant)
Output: --out = a full Hugging Face model folder (convert it with convert_hf_to_gguf.py)
Only the assistant's JSON answer is learned, not the long instruction.
"""
import argparse, os, torch
from datasets import load_dataset
from peft import LoraConfig
from transformers import AutoModelForCausalLM, AutoTokenizer
from transformers.trainer_utils import get_last_checkpoint
from trl import SFTConfig, SFTTrainer

ap = argparse.ArgumentParser()
ap.add_argument("--base", required=True, help="folder with config.json, tokenizer files and model.safetensors")
ap.add_argument("--data", default="./data")
ap.add_argument("--out", default="./Sent_model_hinglish")
ap.add_argument("--ckpt", default=None, help="where progress is saved (use a Google Drive folder); default: next to --out")
ap.add_argument("--epochs", type=float, default=2.0)
ap.add_argument("--lr", type=float, default=2e-4)
ap.add_argument("--rank", type=int, default=16, help="size of the add-on: bigger holds more knowledge (32 or 64 for large mixed data)")
ap.add_argument("--save_steps", type=int, default=50, help="save progress every N steps")
ap.add_argument("--val_max", type=int, default=300, help="use at most N validation examples (keeps the quiz short)")
ap.add_argument("--max_steps", type=int, default=-1, help="stop after N steps (smoke tests only)")
a = ap.parse_args()
ckpt = a.ckpt or (a.out + "_checkpoints")

if os.path.exists(os.path.join(a.out, "model.safetensors")):
    print("Already trained, nothing to do:", a.out)
    raise SystemExit

gpu = torch.cuda.is_available()
cap = torch.cuda.get_device_capability()[0] if gpu else 0
bf16 = gpu and cap >= 8   # real bf16 needs an Ampere-or-newer GPU. A T4 (7.5) only imitates it, so it uses fp16
fp16 = gpu and not bf16
dtype = torch.bfloat16 if bf16 else (torch.float16 if fp16 else torch.float32)   # no GPU (smoke tests only): float32
print("gpu:", gpu, "| " + (torch.cuda.get_device_name(0) + " | " if gpu else "") + "dtype:", dtype)

tok = AutoTokenizer.from_pretrained(a.base)
if tok.pad_token is None:
    tok.pad_token = tok.eos_token
model = AutoModelForCausalLM.from_pretrained(a.base, dtype=dtype, device_map="auto")


def to_prompt_completion(ex):   # system + user = the prompt; the assistant JSON = the only thing it must learn to write
    m = ex["messages"]
    return {"prompt": m[:2], "completion": m[2:]}


def load(name):
    ds = load_dataset("json", data_files=f"{a.data}/{name}.jsonl")["train"]
    return ds.map(to_prompt_completion, remove_columns=ds.column_names)


train, val = load("train"), load("val")
val = val.select(range(min(len(val), a.val_max)))
print("train", len(train), "val", len(val))

lora = LoraConfig(r=a.rank, lora_alpha=2 * a.rank, lora_dropout=0.05, task_type="CAUSAL_LM",
                  target_modules=["q_proj", "k_proj", "v_proj", "o_proj", "gate_proj", "up_proj", "down_proj"])
BATCH, ACCUM = 2, 8   # 2 examples at a time, 8 times, then one update = 16 examples per step
total_steps = max(1, int(len(train) / (BATCH * ACCUM) * a.epochs))
warmup = max(1, int(0.03 * total_steps))
print("steps:", total_steps, "| warm-up steps:", warmup)
cfg = SFTConfig(
    output_dir=ckpt, num_train_epochs=a.epochs, max_steps=a.max_steps, learning_rate=a.lr, lr_scheduler_type="cosine", warmup_steps=warmup,
    per_device_train_batch_size=BATCH, gradient_accumulation_steps=ACCUM, gradient_checkpointing=True,
    max_length=1024, logging_steps=10, eval_strategy="steps", eval_steps=250,
    save_strategy="steps", save_steps=a.save_steps, save_total_limit=2,   # progress is saved here, keep the last 2 saves
    bf16=bf16, fp16=fp16, use_cpu=not gpu, report_to="none",
)
trainer = SFTTrainer(model=model, args=cfg, train_dataset=train, eval_dataset=val, processing_class=tok, peft_config=lora)

last = get_last_checkpoint(ckpt) if os.path.isdir(ckpt) else None
print("continuing from saved progress:", last if last else "no (starting fresh)")
trainer.train(resume_from_checkpoint=last)

merged = trainer.model.merge_and_unload()   # fold the add-on into the model: one normal model folder
merged.save_pretrained(a.out, safe_serialization=True)
tok.save_pretrained(a.out)
print("saved the finished model to", a.out)
