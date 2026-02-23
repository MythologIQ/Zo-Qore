#!/usr/bin/env python3
"""Bridge server for Qwen3-TTS HuggingFace Space API.
Exposes local HTTP endpoints that proxy to the Qwen3-TTS Gradio Space.
Runs on port 8201 alongside Pocket TTS on 8200.
"""

import os
import shutil
import tempfile
from pathlib import Path

from fastapi import FastAPI, UploadFile, File, Form
from fastapi.responses import FileResponse, JSONResponse
import uvicorn

app = FastAPI(title="Qwen3-TTS Bridge")

# Lazy-loaded Gradio client
_client = None

def get_client():
    global _client
    if _client is None:
        from gradio_client import Client
        _client = Client("Qwen/Qwen3-TTS")
    return _client

VOICES_DIR = Path("/home/workspace/tts-data/voices")
VOICES_DIR.mkdir(parents=True, exist_ok=True)

SPEAKERS = ["Aiden", "Dylan", "Eric", "Ono_anna", "Ryan", "Serena", "Sohee", "Uncle_fu", "Vivian"]
LANGUAGES = ["Auto", "Chinese", "English", "Japanese", "Korean", "French", "German", "Spanish", "Portuguese", "Russian"]


@app.get("/health")
async def health():
    return {"status": "healthy", "engine": "qwen3-tts-bridge"}


@app.get("/speakers")
async def speakers():
    return {"speakers": SPEAKERS, "languages": LANGUAGES}


@app.post("/voice-design")
async def voice_design(
    text: str = Form(...),
    language: str = Form("Auto"),
    voice_description: str = Form(...),
):
    """Generate speech with a voice designed from a text description."""
    try:
        client = get_client()
        audio_path, status = client.predict(
            text=text,
            language=language,
            voice_description=voice_description,
            api_name="/generate_voice_design",
        )
        if not os.path.exists(audio_path):
            return JSONResponse({"error": "Generation failed", "status": status}, status_code=500)
        return FileResponse(audio_path, media_type="audio/wav", filename="voice_design.wav")
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=500)


@app.post("/custom-voice")
async def custom_voice(
    text: str = Form(...),
    language: str = Form("English"),
    speaker: str = Form("Ryan"),
    instruct: str = Form(...),
    model_size: str = Form("1.7B"),
):
    """Generate speech using a preset speaker with custom instructions."""
    try:
        client = get_client()
        audio_path, status = client.predict(
            text=text,
            language=language,
            speaker=speaker,
            instruct=instruct,
            model_size=model_size,
            api_name="/generate_custom_voice",
        )
        if not os.path.exists(audio_path):
            return JSONResponse({"error": "Generation failed", "status": status}, status_code=500)
        return FileResponse(audio_path, media_type="audio/wav", filename="custom_voice.wav")
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=500)


@app.post("/voice-clone")
async def voice_clone(
    ref_audio: UploadFile = File(...),
    ref_text: str = Form(...),
    target_text: str = Form(...),
    language: str = Form("Auto"),
    model_size: str = Form("1.7B"),
):
    """Clone a voice from a reference audio and generate new speech."""
    tmp_path = None
    try:
        # Save uploaded audio to temp file
        suffix = Path(ref_audio.filename or "ref.wav").suffix or ".wav"
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
            tmp_path = tmp.name
            shutil.copyfileobj(ref_audio.file, tmp)

        client = get_client()
        audio_path, status = client.predict(
            ref_audio=tmp_path,
            ref_text=ref_text,
            target_text=target_text,
            language=language,
            use_xvector_only=False,
            model_size=model_size,
            api_name="/generate_voice_clone",
        )
        if not os.path.exists(audio_path):
            return JSONResponse({"error": "Clone failed", "status": status}, status_code=500)
        return FileResponse(audio_path, media_type="audio/wav", filename="voice_clone.wav")
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=500)
    finally:
        if tmp_path and os.path.exists(tmp_path):
            os.unlink(tmp_path)


@app.post("/save-voice")
async def save_voice(
    name: str = Form(...),
    audio: UploadFile = File(...),
):
    """Save a generated voice sample for later use."""
    safe_name = "".join(c for c in name if c.isalnum() or c in "-_").strip()
    if not safe_name:
        return JSONResponse({"error": "Invalid voice name"}, status_code=400)

    dest = VOICES_DIR / f"{safe_name}.wav"
    with open(dest, "wb") as f:
        shutil.copyfileobj(audio.file, f)

    return {"saved": True, "name": safe_name, "path": str(dest)}


@app.get("/voices")
async def list_voices():
    """List saved voice samples."""
    voices = []
    for f in sorted(VOICES_DIR.iterdir()):
        if f.suffix in (".wav", ".safetensors"):
            voices.append({
                "id": f.stem,
                "file": f.name,
                "size": f.stat().st_size,
            })
    return {"voices": voices}


if __name__ == "__main__":
    port = int(os.environ.get("PORT", "8201"))
    uvicorn.run(app, host="127.0.0.1", port=port)
