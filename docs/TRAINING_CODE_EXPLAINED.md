# The training code, explained line by line

Audience: someone new to AI who wants to know exactly what every line does and why it is there.
Files covered: `prototype/training/train_lora.py` (the teacher) and `prototype/training/train_colab.ipynb` (the notebook that prepares everything and starts the teacher).

---

## Part 0. Words you need first

| Word | Plain meaning |
|---|---|
| **Model** | A big file of numbers that has learned patterns in language. Yours is about 3.1 billion numbers. |
| **Weights / parameters** | Those numbers. "Training" means nudging them. |
| **Token** | A piece of text, about 3 to 4 letters. The model reads and writes tokens, not letters. "chai 30" is about 3 tokens. |
| **Tokenizer** | The tool that cuts text into tokens and turns them into ids (numbers). It lives in `tokenizer.json`. |
| **Prompt** | What we give the model: the instruction paragraph plus the user's message. |
| **Completion** | What the model should answer: here, a small JSON label like `{"intent":"log_spend",...}`. |
| **Fine-tuning** | Teaching an already-trained model a new skill with examples. |
| **LoRA** | A cheap way to fine-tune. We freeze the big model and train a tiny "add-on" (about 1% of the numbers). |
| **Adapter** | The tiny add-on that LoRA trains. |
| **Merge** | Folding the add-on back into the model so it becomes one normal model again. |
| **Epoch** | One full pass over all training examples. We do 2. |
| **Batch** | A handful of examples processed together. |
| **Step** | One update of the model after looking at a batch (or several batches added together). |
| **Loss** | A score of how wrong the model is on the examples. **Lower is better.** |
| **Learning rate** | How big each correction is. Too big: it overshoots. Too small: it learns nothing. |
| **Validation set (val)** | Examples the model does NOT train on, used to check it is really learning and not memorising. |
| **Test set** | A final exam. Never used in training or tuning. |
| **GPU / VRAM** | The graphics chip that does the maths fast, and its memory. Colab's free GPU is a T4 with about 15 GB. |
| **fp16 / bf16 / fp32** | How precisely each number is stored (16-bit float, "brain" 16-bit float, 32-bit float). Fewer bits means less memory and more speed. |
| **safetensors** | A safe file format for model weights (`model.safetensors`). |
| **JSONL** | A text file with one JSON object per line. Our examples are in this format. |
| **Hugging Face** | A website and a family of Python libraries for sharing and using models and datasets. |
| **transformers** | The Hugging Face library that loads and runs models. |
| **peft** | The library that implements LoRA ("parameter-efficient fine-tuning"). |
| **trl** | The library that runs supervised fine-tuning (`SFTTrainer`). |
| **datasets** | The library that reads and transforms example files. |
| **accelerate** | A helper library that places the model on the GPU(s). |

---

## Part 1. What one training example looks like

A line in `train.jsonl` (simplified) is one object with three messages:

```json
{"messages": [
  {"role": "system",    "content": "You turn one message from a budgeting-app user into a JSON intent ... Today is 2026-09-14 (monday). Categories: food (...), chai (...)"},
  {"role": "user",      "content": "sun gave 1500 yaar."},
  {"role": "assistant", "content": "{\"intent\":\"ask\",\"question\":\"What was the 1500 for?\"}"}
]}
```

- **system** = the instruction paragraph our app always sends.
- **user** = what the person typed.
- **assistant** = the correct answer. This is the only part the model is trained to produce.

---

## Part 2. `train_lora.py` line by line

### The header text (lines 1 to 13)
A comment block (text between triple quotes). It states what the script does, that it needs a GPU, that it was not tested on the author's laptop, how to run it, what files it reads (`train.jsonl`, `val.jsonl`) and what it writes (a full model folder). Line 12 says the model learns only from the assistant's JSON, not from the long instruction.

### Imports (lines 14 to 18)
```python
import argparse, json, torch
```
Loads three Python tools. `argparse` reads the settings typed after the command (like `--base`). `json` reads JSON text. `torch` (PyTorch) is the maths engine that runs on the GPU.

```python
from datasets import load_dataset
```
Brings in the function that reads our example files.

```python
from peft import LoraConfig
```
Brings in the settings object for the LoRA add-on.

```python
from transformers import AutoModelForCausalLM, AutoTokenizer
```
`AutoModelForCausalLM` loads a model that predicts the next token ("causal language model"). `AutoTokenizer` loads the tool that turns text into tokens. The "Auto" prefix means "work out the right type from the files".

```python
from trl import SFTConfig, SFTTrainer
```
`SFTConfig` holds the training settings. `SFTTrainer` is the machine that runs the training. SFT means supervised fine-tuning: learning from examples with right answers.

### Reading the settings (lines 20 to 27)
```python
ap = argparse.ArgumentParser()
```
Creates a reader for command-line settings.

```python
ap.add_argument("--base", required=True, help="folder with config.json, tokenizer files and model.safetensors")
```
Declares a setting called `--base`: the folder holding the model to teach. `required=True` means the script refuses to start without it. (This is why the empty `""` path crashed earlier.)

```python
ap.add_argument("--data", default="./data")
ap.add_argument("--out", default="./Sent_model_hinglish")
```
`--data` is the folder with the example files. `--out` is where to save the new model. `default=` is what is used if you do not type them.

```python
ap.add_argument("--epochs", type=float, default=2.0)
```
How many passes over the examples. `type=float` allows 0.5 or 1.5.

```python
ap.add_argument("--lr", type=float, default=2e-4)
```
The learning rate. `2e-4` means 0.0002, a normal value for LoRA.

```python
ap.add_argument("--max_steps", type=int, default=-1, help="stop after N steps (smoke tests only)")
```
A brake used for quick tests. `-1` means "no limit, run all epochs".

```python
a = ap.parse_args()
```
Reads what you typed and stores it in `a`. From now on `a.base`, `a.data`, `a.out`, `a.epochs` hold your values.

### Choosing the number format (lines 29 to 34)
```python
gpu = torch.cuda.is_available()
```
`True` if there is an NVIDIA GPU, otherwise `False`. (CUDA is NVIDIA's GPU technology.)

```python
cap = torch.cuda.get_device_capability()[0] if gpu else 0
```
Asks the GPU how new it is. "Compute capability" is a version number. A T4 is 7.5, so this takes the first part: 7. With no GPU it is 0.

```python
bf16 = gpu and cap >= 8
```
Use `bfloat16` only on GPUs of version 8 or newer. A T4 *claims* to support it but only imitates it slowly, and the library's fast loss calculation then crashes. That was your earlier error.

```python
fp16 = gpu and not bf16
```
On older GPUs like the T4, use `float16`.

```python
dtype = torch.bfloat16 if bf16 else (torch.float16 if fp16 else torch.float32)
```
Picks the actual number format: bf16, else fp16, else (no GPU) plain 32-bit. The one-line `A if test else B` is Python's compact "if".

```python
print("gpu:", gpu, "| " + (...) + "dtype:", dtype)
```
Prints which GPU and format were chosen, so you can check it. You saw `gpu: True | Tesla T4 | dtype: torch.float16`.

### Loading the tokenizer and model (lines 35 to 38)
```python
tok = AutoTokenizer.from_pretrained(a.base)
```
Loads the tokenizer from the model folder (needs `tokenizer.json`).

```python
if tok.pad_token is None:
    tok.pad_token = tok.eos_token
```
Examples have different lengths. To stack them in a batch, shorter ones are padded with a "pad" token. If the tokenizer has no pad token, reuse the "end of text" token as padding.

```python
model = AutoModelForCausalLM.from_pretrained(a.base, dtype=dtype, device_map="auto")
```
Loads the 3.1 billion numbers from `model.safetensors`. `dtype` sets the number format. `device_map="auto"` lets the `accelerate` library put the model on the GPU. This is the step that took about 26 seconds in your run.

### Preparing the examples (lines 41 to 52)
```python
def to_prompt_completion(ex):
    m = ex["messages"]
    return {"prompt": m[:2], "completion": m[2:]}
```
A small function. `ex` is one example. `m[:2]` means "the first two messages" (system and user) which become the **prompt**. `m[2:]` means "everything after" (the assistant answer), the **completion**. Splitting them lets the trainer compute the loss only on the completion.

```python
def load(name):
    ds = load_dataset("json", data_files=f"{a.data}/{name}.jsonl")["train"]
    return ds.map(to_prompt_completion, remove_columns=ds.column_names)
```
`load("train")` reads `train.jsonl`. `["train"]` is just the label the library puts on a file with no splits. `.map(...)` applies our function to every example. `remove_columns` drops the old columns (id, intent, messages) so only `prompt` and `completion` remain. `f"..."` is a string with values inserted.

```python
train, val = load("train"), load("val")
print("train", len(train), "val", len(val))
```
Loads both files and prints their sizes. You saw `train 7834 val 971`.

### The LoRA add-on (lines 54 and 55)
```python
lora = LoraConfig(r=16, lora_alpha=32, lora_dropout=0.05, task_type="CAUSAL_LM",
                  target_modules=["q_proj", "k_proj", "v_proj", "o_proj", "gate_proj", "up_proj", "down_proj"])
```
- `r=16`: the add-on's "size" (rank). Bigger can learn more but costs more.
- `lora_alpha=32`: a strength multiplier for the add-on. A common rule is twice `r`.
- `lora_dropout=0.05`: while training, randomly ignore 5% of the add-on's connections. This reduces memorising.
- `task_type="CAUSAL_LM"`: this is a "predict the next token" model.
- `target_modules`: which parts of the model get an add-on. `q_proj, k_proj, v_proj, o_proj` are the attention parts (how the model decides which earlier words matter). `gate_proj, up_proj, down_proj` are the feed-forward parts (where it processes information).

### Working out the schedule (lines 56 to 59)
```python
BATCH, ACCUM = 2, 8
```
Process 2 examples at a time; do that 8 times (accumulate the corrections), then update once. So each update uses 2 x 8 = **16 examples**. This fits the small GPU memory.

```python
total_steps = max(1, int(len(train) / (BATCH * ACCUM) * a.epochs))
```
With 7,834 examples: 7834 / 16 = 489.6 steps per pass, times 2 passes = about 979 steps. (Your screen shows 980; the trainer rounds up.) `max(1, ...)` stops it ever being 0.

```python
warmup = max(1, int(0.03 * total_steps))
```
The first 3% of steps (29 here) use a very small learning rate that grows gradually. Starting gently avoids wrecking the model with early big corrections. We give it in steps because the older "ratio" option was removed (that was your first error).

```python
print("optimizer steps:", total_steps, "| warmup steps:", warmup)
```
Shows both numbers.

### The training settings (lines 60 to 65)
```python
cfg = SFTConfig(
```
Collects the settings in one object:
- `output_dir=a.out + "_checkpoints"`: a scratch folder for the trainer's own files.
- `num_train_epochs=a.epochs`: how many passes (2).
- `max_steps=a.max_steps`: the optional brake (-1 = off).
- `learning_rate=a.lr`: 0.0002.
- `lr_scheduler_type="cosine"`: after warm-up, the learning rate shrinks smoothly along a cosine curve toward zero, so late corrections are gentle.
- `warmup_steps=warmup`: from above.
- `per_device_train_batch_size=BATCH`: 2 examples at a time.
- `gradient_accumulation_steps=ACCUM`: add up 8 batches before updating.
- `gradient_checkpointing=True`: saves GPU memory by recomputing some work instead of storing it. Costs some speed. It is a reason each step takes about 11 seconds.
- `max_length=1024`: cut any example longer than 1024 tokens.
- `logging_steps=10`: print the numbers every 10 steps.
- `eval_strategy="steps"` and `eval_steps=100`: run the practice quiz (validation) every 100 steps. This is the 122-step bar you saw (971 examples / 8 per batch).
- `save_strategy="no"`: do not save partial copies. (Weakness: if Colab disconnects, you lose everything.)
- `bf16=bf16, fp16=fp16`: switch on the chosen mixed-precision maths.
- `use_cpu=not gpu`: use the CPU only if there is no GPU.
- `report_to="none"`: do not send results to online dashboards.

### Training (lines 66 and 67)
```python
trainer = SFTTrainer(model=model, args=cfg, train_dataset=train, eval_dataset=val, processing_class=tok, peft_config=lora)
```
Builds the trainer with everything: the model, the settings, the training examples, the validation examples, the tokenizer (`processing_class`), and the LoRA settings. At this point it **attaches the add-on** and freezes the original weights. It also tokenizes all examples (the progress bars about "Tokenizing" and "Building labels" in your log).

```python
trainer.train()
```
**This is the training.** For each step: show the model examples, compare its guesses with the right answers (loss), work out how each add-on number should change (gradient), and update them. About 980 times.

### Saving (lines 69 to 72)
```python
merged = trainer.model.merge_and_unload()
```
Folds the add-on into the original weights and removes the add-on wrapper. The result is one ordinary model that behaves as if it had been trained directly.

```python
merged.save_pretrained(a.out, safe_serialization=True)
```
Writes the model to the output folder as `model.safetensors` (about 6 GB).

```python
tok.save_pretrained(a.out)
```
Saves the tokenizer files next to it, so the folder is complete and loadable.

```python
print("saved the merged model to", a.out)
```
Confirms where it went.

---

## Part 3. The notebook, cell by cell

A **cell** is one block you can run. Lines starting with `!` run as computer commands. In a `!` line, `$NAME` is replaced by the Python variable `NAME`. Variables only exist while the Colab session is alive.

### Cell 1: setup
```python
!nvidia-smi -L
```
Lists the GPU (for example `Tesla T4`). Proves a GPU is attached.

```python
from google.colab import drive
drive.mount('/content/drive')
```
Connects your Google Drive so the notebook can read the model. Colab asks you to allow it.

```python
import os, json, random, re, shutil, itertools
```
Loads standard tools: file paths (`os`), JSON, randomness, text patterns (`re`, regular expressions), file copying (`shutil`).

```python
CANDIDATES = ['/content/drive/MyDrive/Sent_model', '/content/drive/MyDrive/Hisaab/Sent_model']
BASE_DRIVE = next((p for p in CANDIDATES if os.path.exists(p + '/model.safetensors')), None)
```
Two places your model folder might be. `next(... , None)` picks the first one that really contains `model.safetensors`, or `None`.

```python
assert BASE_DRIVE, 'Model folder not found. ...'
```
`assert` stops the notebook with that message if nothing was found.

```python
OUT_DRIVE = os.path.dirname(BASE_DRIVE) + '/Sent_model_hinglish'
```
Where the trained model will be saved: next to your model folder.

```python
EPOCHS = 2
N_HINGLISH_NEG = 1500
N_BANK_NEG = 1000
N_TEST_REAL = 80
```
Settings: passes over the data; how many everyday-chat "do nothing" lines to add; how many bank-question "do nothing" lines to add; how many lines to keep aside for the final check. "Neg" is short for negative example: a message that must NOT trigger any action.

```python
need = ['config.json', 'model.safetensors', 'tokenizer.json', 'tokenizer_config.json']
missing = [f for f in need if not os.path.exists(BASE_DRIVE + '/' + f)]
assert not missing, 'MISSING in the Drive folder ...'
```
Checks each required file exists. The list comprehension `[f for f in need if ...]` collects the missing ones. If any are missing, the notebook stops and names them.

### Cell 2: install and download our files
```
!pip install -q -U transformers peft trl datasets accelerate
```
Installs or upgrades the five libraries. `-q` is quiet, `-U` is upgrade.

```
!pip uninstall -y -q torchao
```
Removes an old helper package that breaks the newest `peft`. We do not use it.

```
!rm -rf /content/repo && git clone -q https://github.com/sohail807/hisaab_aunty /content/repo
```
Deletes any old copy, then downloads our repo from GitHub. `&&` means "only if the first part worked". This gives us `train_lora.py` and the example files.

```
!ls -la /content/repo/prototype/training/data
```
Lists the example files so you can see they arrived.

### Cell 3: which model folder to use
```python
BASE = BASE_DRIVE
```
Train straight from Drive (no 5.75 GB copy). `BASE` is what the training command uses.

### Cell 4: load our examples
```python
random.seed(7)
```
Makes the random shuffles the same every run.

```python
R = '/content/repo/prototype/training/data'
def read(p): return [json.loads(l) for l in open(p, encoding='utf-8')]
```
`R` is the folder. `read` opens a file and turns each line into a Python dictionary.

```python
train, val, test = read(R + '/train.jsonl'), read(R + '/val.jsonl'), read(R + '/test.jsonl')
```
Three lists: homework, practice quiz, final exam.

```python
systems = [r['messages'][0]['content'] for r in train]
```
From every training example, collect the instruction paragraph (first message). Cell 6 reuses these so the new "do nothing" examples have the identical instruction.

```python
print('our data: train', len(train), 'val', len(val), 'test', len(test))
```
Shows the counts.

### Cell 5: download public "do nothing" examples
```python
from datasets import load_dataset
SKIP = re.compile(r"(\d|₹|\brs\b|rupee|...|aunty|http|www|@)", re.I)
```
A long pattern (regular expression) of words and symbols to avoid: digits, the rupee sign, money words, banking words, greetings, tax words, links. `\b` means "word boundary". `re.I` ignores capitals. A line matching any of these is skipped. Why: such lines could legitimately belong to one of Aunty's real intents, and labelling them "do nothing" would teach the wrong thing.

```python
def strings(x): ...
```
A recursive helper: given any nested data (text, a dictionary, a list), it yields every piece of text inside. It lets us read datasets without knowing their exact layout.

```python
def clean_lines(rows, limit_rows): ...
```
For each row: split text into lines; strip speaker labels like "Person 1:"; keep only lines that are 3 to 14 words, contain only plain English letters and basic punctuation (`re.fullmatch`), and do not match `SKIP`. A `set` removes duplicates. Returns them sorted.

```python
ds = load_dataset('Abhishekcr448/Hinglish-Everyday-Conversations-1M', split='train', streaming=True)
hinglish = clean_lines(ds, 30000)
```
Reads the first 30,000 rows from the Hinglish chat dataset on Hugging Face. `streaming=True` reads it row by row without downloading the whole thing.

```python
for name in ['PolyAI/banking77', 'legacy-datasets/banking77']:
    try: ... break
    except Exception as e: print('could not load', ...)
```
Tries two possible names for the Banking77 bank-question dataset. `try/except` means "if it fails, print why and carry on". `break` stops at the first that works.

```python
sources.append('... (license reported: MIT ...)')
```
Records where data came from, to write credits later.

### Cell 6: build the final training files
```python
def neg(text): return {'id': 'real_neg', 'intent': 'unknown', 'messages': [system, user, assistant]}
```
Wraps a plain line as a full example: the instruction, the line as the user message, and the answer `{"intent":"unknown"}` ("do nothing").

```python
random.shuffle(hinglish); random.shuffle(bank)
held = hinglish[:N_TEST_REAL // 2] + bank[:N_TEST_REAL // 2]
hinglish, bank = hinglish[N_TEST_REAL // 2:], bank[N_TEST_REAL // 2:]
```
Mix the order, set aside 40 of each as the exam (`held`), and remove them from the pool so they are never trained on. `//` is whole-number division.

```python
real_train = ...   real_val = ...
mix_train, mix_val = train + real_train, val + real_val
random.shuffle(mix_train); random.shuffle(mix_val)
```
Take 1,500 + 1,000 "do nothing" lines for training and 100 for validation, add them to our own examples, and shuffle so the kinds are mixed.

```python
open('/content/mix/' + name + '.jsonl', 'w', encoding='utf-8').write(...)
```
Writes `train.jsonl`, `val.jsonl` and `test_real.jsonl`, one JSON object per line. These are what the training command reads (`--data /content/mix`).

### Cell 7: train
```
!python /content/repo/prototype/training/train_lora.py --base "$BASE" --data /content/mix --out /content/out --epochs $EPOCHS
```
Runs the script from Part 2 in its own process, so the GPU memory is fully freed afterwards. `--base "$BASE"` is the model folder, `--data /content/mix` the examples from cell 6, `--out /content/out` the output folder, `--epochs $EPOCHS` the number of passes.

### Cell 8: save to Drive
```python
shutil.copytree('/content/out', OUT_DRIVE, dirs_exist_ok=True)
```
Copies the finished model from Colab's temporary disk into your Drive. Colab's disk is erased when the session ends, so this step is what makes the result permanent.

```python
open(OUT_DRIVE + '/DATA_SOURCES.md', 'w').write(...)
```
Writes a credits file listing the data used and a reminder to check licenses.

### Cell 9: the exam
```python
tok = AutoTokenizer.from_pretrained('/content/out')
model = AutoModelForCausalLM.from_pretrained('/content/out', dtype=torch.float16, device_map='auto')
```
Loads the trained model and its tokenizer from the output folder.

```python
sample = [... 60 of our test examples ...] + [... the 80 held-out real "do nothing" lines ...]
```
Picks about 60 messages evenly spread through our test file, plus the held-out real lines.

```python
def ask(r):
    prompt = tok.apply_chat_template(r['messages'][:2], tokenize=False, add_generation_prompt=True)
    ids = tok(prompt, return_tensors='pt').to(model.device)
    out = model.generate(**ids, max_new_tokens=120, do_sample=False)
    return tok.decode(out[0][ids['input_ids'].shape[1]:], skip_special_tokens=True).strip()
```
- `apply_chat_template`: wraps system and user text in the model's special chat format (`<|im_start|>` markers). `add_generation_prompt=True` adds the "assistant, your turn" marker.
- `tok(prompt, return_tensors='pt')`: converts the text into token ids as PyTorch tensors; `.to(model.device)` moves them to the GPU.
- `model.generate(..., max_new_tokens=120, do_sample=False)`: the model writes up to 120 tokens. `do_sample=False` means it always picks the most likely next token, so the answer is repeatable.
- `tok.decode(out[0][ids['input_ids'].shape[1]:], ...)`: turns the new tokens back into text. The slice `[... :]` keeps only the part after the prompt, so we get just the answer.

```python
def intent_of(s): ... re.search(r'\{.*\}', s, re.S) ... json.loads(...).get('intent')
```
Finds the first `{...}` in the answer and reads its `intent` value. Returns `None` if the answer is not valid JSON.

```python
for r in sample: ... valid += ... ; ok += pred == gold ; wrong_saves ...
```
For each exam message: ask the model, compare its intent with the correct one, and count: valid JSON, right intent, and **wrong saves** (the model said `log_spend` when it should not have). Real "do nothing" lines are counted separately.

```python
print(f'messages {n} | valid JSON ... | right intent ... [baseline before training: 59%]')
```
Prints the scores. Note: the old 59% was measured on a different test sample. The fair baseline on the current test file is about 50%.

---

## Part 4. What to watch while it runs
- `loss` should fall; `mean_token_accuracy` should rise.
- `eval_loss` (every 100 steps) should also fall. If `loss` falls but `eval_loss` rises, the model is memorising.
- Each step takes about 11 seconds on a T4. About 980 steps, plus 10 practice quizzes of about 3 minutes each.
- Keep the tab open. If the session disconnects you must start again.
