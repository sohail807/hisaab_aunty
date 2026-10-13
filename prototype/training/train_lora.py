"""
Fine-tune the team model for Hinglish intents with LoRA (small add-on weights), then merge them into a full model.

Run this on a machine with a GPU (a free Google Colab T4 works). A laptop CPU cannot do this in a sensible time.
NOT TESTED HERE: this laptop has no GPU. Package versions move fast; if a keyword changes, the error message will say which.

  pip install -U transformers peft trl datasets accelerate
  python train_lora.py --base ./Sent_model --data ./data --out ./Sent_model_hinglish

Inputs : data/train.jsonl and data/val.jsonl  (made by gen_dataset.js; chat format: system, user, assistant)
Output : OUT/ = a full Hugging Face model folder. Convert it with convert_hf_to_gguf.py, exactly as before.
Only the assistant's JSON is learned (loss on the answer, not on the long instruction).
"""
import argparse, json, torch
from datasets import load_dataset
from peft import LoraConfig
from transformers import AutoModelForCausalLM, AutoTokenizer
from trl import SFTConfig, SFTTrainer

ap = argparse.ArgumentParser()
ap.add_argument("--base", required=True, help="folder with config.json, tokenizer files and model.safetensors")
ap.add_argument("--data", default="./data")
ap.add_argument("--out", default="./Sent_model_hinglish")
ap.add_argument("--epochs", type=float, default=2.0)
ap.add_argument("--lr", type=float, default=2e-4)
a = ap.parse_args()

bf16 = torch.cuda.is_available() and torch.cuda.is_bf16_supported()   # a Colab T4 has no bf16, so it falls back to fp16
dtype = torch.bfloat16 if bf16 else torch.float16
tok = AutoTokenizer.from_pretrained(a.base)
if tok.pad_token is None:
    tok.pad_token = tok.eos_token
model = AutoModelForCausalLM.from_pretrained(a.base, torch_dtype=dtype, device_map="auto")


def to_prompt_completion(ex):   # system + user is the prompt; the assistant JSON is the only thing the model learns to produce
    m = ex["messages"]
    return {"prompt": m[:2], "completion": m[2:]}


def load(name):
    ds = load_dataset("json", data_files=f"{a.data}/{name}.jsonl")["train"]
    return ds.map(to_prompt_completion, remove_columns=ds.column_names)


train, val = load("train"), load("val")
print("train", len(train), "val", len(val))

lora = LoraConfig(r=16, lora_alpha=32, lora_dropout=0.05, task_type="CAUSAL_LM",
                  target_modules=["q_proj", "k_proj", "v_proj", "o_proj", "gate_proj", "up_proj", "down_proj"])
cfg = SFTConfig(
    output_dir=a.out + "_checkpoints", num_train_epochs=a.epochs, learning_rate=a.lr, lr_scheduler_type="cosine", warmup_ratio=0.03,
    per_device_train_batch_size=2, gradient_accumulation_steps=8, gradient_checkpointing=True,
    max_length=1024, logging_steps=10, eval_strategy="steps", eval_steps=100, save_strategy="no",
    bf16=bf16, fp16=not bf16, report_to="none",
)
trainer = SFTTrainer(model=model, args=cfg, train_dataset=train, eval_dataset=val, processing_class=tok, peft_config=lora)
trainer.train()

merged = trainer.model.merge_and_unload()   # fold the LoRA weights into the base weights: one normal model folder
merged.save_pretrained(a.out, safe_serialization=True)
tok.save_pretrained(a.out)
print("saved the merged model to", a.out)
