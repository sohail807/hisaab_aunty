> **Note (18 Oct 2026):** this file describes the round-1 flow (old notebook). The current training flow, data and notebook are described in docs/HANDOVER.md, section 7.

# Hinglish training for the intent model

The model's only job: turn one message into ONE JSON intent. Code does everything else. Training makes it better at Hinglish, typos and "is this a question or a spend?".

## What is here
| File | What it does |
|---|---|
| `gen_dataset.js` | Makes `data/train.jsonl`, `val.jsonl`, `test.jsonl`. Every label is checked by the real validator. Test phrasings are never in train. |
| `eval_model.js` | Scores any model in `models.json` on the test set: valid JSON, right intent, right amounts, **wrong writes (must be 0)**, speed. |
| `train_lora.py` | LoRA fine-tune on a GPU, then merge into a full model folder. Not run on this laptop (no GPU). |

## Steps
1. **Baseline first** (before training): `node training/eval_model.js --model team-model-f16 --n 70`
2. **Train on a free GPU** (Google Colab T4 or Kaggle): upload your model folder (`Sent_model`) and `training/data/`, then
   `pip install -U transformers peft trl datasets accelerate`
   `python train_lora.py --base ./Sent_model --data ./data --out ./Sent_model_hinglish`
3. **Download** `Sent_model_hinglish` (about 6 GB) to your PC.
4. **Convert** to GGUF with `convert_hf_to_gguf.py`, same as before (`--outtype f16`).
5. **Add it** to `models.json` (new port, new id) and start another `llama-server` for it.
6. **Compare**: `node training/eval_model.js --model <new id> --n 70`. Keep the new model only if intent accuracy goes up and wrong writes stay 0.

## Rules
- Training teaches **intent and format**, not Indian tax or banking facts. Facts come from the CA-approved knowledge base.
- Labels never contain figures the user did not type. Words-only amounts are labelled with the number, and the validator then asks the user to confirm with digits.
- When the CA-knowledge feature ships, add a `learn` intent, add examples for it, and retrain. Today tax, loan, insurance and investment questions are labelled `unknown`.
- Add every real failure (from the Aunty trace tab) as new rows in `gen_dataset.js`, regenerate, retrain.
- The dataset is synthetic. Real user messages (with consent, no personal data) will beat it. Log them later.
