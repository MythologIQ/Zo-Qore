#!/usr/bin/env python3
"""
Helper script to call Zo MCP tools and return JSON results
"""
import sys
import json

def get_emails():
    """Get recent emails using gmail-find-email"""
    # This will be called by the Zo MCP system
    # For now, return a placeholder structure
    return {
        "emails": [
            {
                "id": "placeholder",
                "from": "example@gmail.com",
                "subject": "Test Email",
                "snippet": "This is a test email",
                "date": "2026-02-15"
            }
        ]
    }

def get_calendar():
    """Get calendar events using google_calendar-list-events"""
    return {
        "events": [
            {
                "id": "placeholder",
                "summary": "Test Event",
                "start": "2026-02-16T10:00:00",
                "end": "2026-02-16T11:00:00",
                "location": "Office"
            }
        ]
    }

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(json.dumps({"error": "No command specified"}))
        sys.exit(1)
    
    command = sys.argv[1]
    
    if command == "emails":
        result = get_emails()
    elif command == "calendar":
        result = get_calendar()
    else:
        result = {"error": f"Unknown command: {command}"}
    
    print(json.dumps(result))
