# Victor TTS Service - Qwen3 Integration

## Current Status

✅ **Service Running:** `https://victor-tts-frostwulf.zocomputer.io`  
⚠️ **Model Status:** Stub mode (Qwen3 model not yet loaded)

## Setup Instructions

### Option 1: Use Qwen3 TTS Model (Recommended)

1. **Install Qwen3 dependencies:**
   ```bash
   cd /home/workspace/victor-tts
   pip install qwen-audio transformers torch torchaudio
   ```

2. **Update `server.py` to load Qwen3:**
   Replace the `load_model()` function with actual Qwen3 loading code:
   ```python
   from transformers import AutoModel, AutoTokenizer
   
   tokenizer = AutoTokenizer.from_pretrained("Qwen/Qwen-Audio-TTS")
   tts_model = AutoModel.from_pretrained("Qwen/Qwen-Audio-TTS")
   ```

3. **Restart the service:**
   ```bash
   # Service will auto-restart, or manually:
   pkill -f victor-tts
   ```

### Option 2: Use Alternative TTS (Fallback)

If Qwen3 is too complex or not working:

**Piper TTS (Lightweight):**
```bash
pip install piper-tts
# Update server.py to use Piper instead
```

**Edge TTS (Cloud-based, free):**
```bash
pip install edge-tts
# Update server.py to use Edge TTS
```

**Browser-based (No backend):**
- Use Web Speech API's `speechSynthesis` in the frontend
- No server-side TTS needed

## Testing

```bash
# Health check
curl https://victor-tts-frostwulf.zocomputer.io/health

# Test TTS (once model is loaded)
curl -X POST https://victor-tts-frostwulf.zocomputer.io/tts \
  -H "Content-Type: application/json" \
  -d '{"text": "Hello from Victor"}' \
  --output test.wav
```

## Architecture

```
Victor Dashboard (zo.space/victor)
  ↓ Speech-to-Text (Browser Web Speech API)
  ↓ User speaks → transcript
  ↓ Send to /api/victor/chat
  ↓ Victor responds with text
  ↓ Send to /api/victor/tts
  ↓ Forward to victor-tts service
  ↓ Qwen3 generates audio
  ↓ Browser plays audio
```

## Next Steps

1. **Choose TTS backend** (Qwen3, Piper, Edge, or browser-based)
2. **Update server.py** with actual model loading
3. **Test voice loop** end-to-end
4. **Integrate with Victor persona** (Zo Ask API with Victor prompt)
