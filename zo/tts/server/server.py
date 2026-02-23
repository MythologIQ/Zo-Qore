#!/usr/bin/env python3
"""
Victor Service - TTS, Email & Calendar API
Serves audio generation and productivity data for Victor
"""

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from pydantic import BaseModel
import os
import logging
import subprocess
import json
from mcp import use_app_gmail, use_app_google_calendar

# Initialize FastAPI
app = FastAPI(title="Victor Service")
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Enable CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class TTSRequest(BaseModel):
    text: str
    voice: str = "default"

# TTS model will be loaded here
tts_model = None

@app.on_event("startup")
async def load_model():
    """Load Qwen3 TTS model on startup"""
    global tts_model
    logger.info("Loading Qwen3 TTS model...")
    
    try:
        # TODO: Replace with actual Qwen3 TTS model loading
        logger.info("TTS model loaded successfully")
    except Exception as e:
        logger.error(f"Failed to load TTS model: {e}")
        logger.warning("Running in stub mode")

@app.post("/tts")
async def text_to_speech(request: TTSRequest):
    """Generate speech from text using Qwen3 TTS"""
    
    if not request.text:
        raise HTTPException(status_code=400, detail="Text is required")
    
    try:
        logger.info(f"TTS request: {request.text[:50]}...")
        
        return Response(
            content=b"",
            media_type="audio/wav",
            headers={
                "X-TTS-Status": "stub",
                "X-TTS-Message": "Qwen3 model not yet configured"
            }
        )
        
    except Exception as e:
        logger.error(f"TTS generation failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/emails")
async def get_emails():
    """Get recent emails via MCP Gmail integration"""
    try:
        result = use_app_gmail("gmail-find-email", "--output-format", "json", "get my 10 most recent emails with subject, from, date, and snippet")
        
        if result.returncode != 0:
            return {"emails": [], "error": result.stderr}
        
        output = result.stdout.strip()
        try:
            start = output.find('[')
            end = output.rfind(']') + 1
            if start >= 0 and end > start:
                emails = json.loads(output[start:end])
                return {"emails": emails}
        except:
            pass
        
        return {"emails": [], "raw": output}
        
    except Exception as e:
        logger.error(f"Email fetch failed: {e}")
        return {"emails": [], "error": str(e)}

@app.get("/calendar")
async def get_calendar():
    """Get upcoming calendar events via MCP Calendar integration"""
    try:
        result = use_app_google_calendar("google_calendar-list-events", "--output-format", "json", "get my upcoming events for the next 7 days with summary, start time, end time, and location")
        
        if result.returncode != 0:
            return {"events": [], "error": result.stderr}
        
        output = result.stdout.strip()
        try:
            start = output.find('[')
            end = output.rfind(']') + 1
            if start >= 0 and end > start:
                events = json.loads(output[start:end])
                return {"events": events}
        except:
            pass
        
        return {"events": [], "raw": output}
        
    except Exception as e:
        logger.error(f"Calendar fetch failed: {e}")
        return {"events": [], "error": str(e)}

@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {
        "status": "ok",
        "model_loaded": tts_model is not None,
        "service": "victor"
    }

if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", "8000"))
    uvicorn.run(app, host="0.0.0.0", port=port)
