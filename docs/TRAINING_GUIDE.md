# Training guide: Hinglish intent model (step by step)

What training does here: it teaches the model to turn one message into ONE JSON intent (log a spend, status, undo, and so on). It does not teach tax or banking facts; those go in the CA-approved knowledge base.

Status of the tools: the dataset generator, the evaluator and the training script exist and are tested on this laptop except the training itself (no GPU here). The notebook has never been run.

## Part A. One-time setup
1. A Google account with about 15 GB free Drive space (the model is 5.75 GB, the trained copy another 6 GB).
2. On your PC, folder `Documents\Sent_model` must hold the ORIGINAL model files: `config.json`, `generation_config.json`, `tokenizer.json`, `tokenizer_config.json`, `chat_template.jinja`, `model.safetensors`. The `.gguf` files are not needed.
3. On your PC, folder `Documents\Hisaab Aunty\prototype\training\data` must hold `train.jsonl`, `val.jsonl`, `test.jsonl`. If missing, run `node training/gen_dataset.js` inside `prototype`.

## Part B. Put the files in Google Drive
1. Open drive.google.com, create a folder `Hisaab`.
2. Upload the folder `Sent_model` into `Hisaab` (slow: 5.75 GB).
3. Upload the folder `data` into `Hisaab`.
4. Check: Drive now shows `Hisaab/Sent_model/model.safetensors` and `Hisaab/data/train.jsonl`.

## Part C. Run the training in Google Colab
1. Open colab.research.google.com and sign in.
2. **File, Upload notebook**, choose `prototype/training/train_colab.ipynb` (from this repo).
3. **Runtime, Change runtime type**, choose **T4 GPU**, Save.
4. **Runtime, Run all.** Allow Drive access when asked.
5. The first cell prints OK or MISSING for each file. If anything says MISSING, fix the Drive folder names and run again.
6. Training runs in the fourth code cell. A free GPU may disconnect after long idle or heavy use; keep the tab open. If it disconnects, run again (it starts from the beginning).
7. The last cell prints how many of 12 sample messages got the right intent. That is only a smoke test.
8. The trained model is saved in Drive at `Hisaab/Sent_model_hinglish`.

## Part D. Bring it back and test it
1. Download `Sent_model_hinglish` from Drive to `Documents`.
2. Convert to GGUF (the converter and its Python 3.12 environment already exist in `Documents\llama.cpp-src`):
   `.\.venv\Scripts\python convert_hf_to_gguf.py "$HOME\Documents\Sent_model_hinglish" --outfile "$HOME\Documents\Sent_model_hinglish\model-hinglish-f16.gguf" --outtype f16`
3. Start it on a new port (8082):
   `llama-server.exe -m "...\model-hinglish-f16.gguf" --host 127.0.0.1 --port 8082 -c 4096 -t 8 -np 1 --api-key <your key>`
4. Add it to `prototype/models.json` (new id, `base_url` `http://127.0.0.1:8082/v1`), restart the proxy, press Refresh in the dashboard LLM tab.
5. Score it: `node training/eval_model.js --model <new id> --n 70` and compare with the baseline (intent 59%, amounts 80%, 2 wrong writes, median 10 s).
6. Keep the new model only if intent accuracy is clearly higher AND wrong writes stay 0. Put both results in Notion, Model tests.

## Part E. Add more data (round 2)
Real datasets can be downloaded straight inside Colab (no PC download needed), for example:
```python
from datasets import load_dataset
ds = load_dataset("Abhishekcr448/Hinglish-Everyday-Conversations-1M", split="train[:50000]")
```
BUT these datasets are not labelled with our 14 intents. A converter is needed (not written yet): take the sentences, label them with our rules, check every label with the validator, and mix them into `train.jsonl`. Check each dataset's license first (see the list in the chat history and the dataset cards).

Round 2 order: (1) team writes 300 real messages with intents, (2) converter for 1 or 2 licensed Hinglish datasets, (3) regenerate, retrain, re-test.

## Rules that never change
- Test messages are never in the training set.
- Every label must pass the validator.
- No real user data without consent; no names, numbers or amounts that identify a person.
- Facts about tax and banking come from the CA-approved knowledge base, not from training.
