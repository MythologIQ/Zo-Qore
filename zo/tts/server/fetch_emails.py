#!/usr/bin/env python3
"""
Fetch emails via zo CLI and output JSON
"""
import subprocess
import json
import sys

try:
    # Call zo to use the Gmail MCP tool
    result = subprocess.run(
        ["python3", "-c", """
import sys
sys.path.insert(0, '/home/.z/cli')
from mcp__zo__use_app_gmail import use_app_gmail
result = use_app_gmail(
    tool_name='gmail-find-email',
    email='krknapp@gmail.com',
    configured_props={'maxResults': 10, 'withTextPayload': True, 'metadataOnly': False}
)
print(result)
"""],
        capture_output=True,
        text=True,
        timeout=30
    )
    
    if result.returncode == 0:
        # Try to extract JSON from output
        output = result.stdout
        # Look for JSON array in the output
        start = output.find('[')
        end = output.rfind(']') + 1
        if start >= 0 and end > start:
            emails = json.loads(output[start:end])
            print(json.dumps({"emails": emails}))
        else:
            print(json.dumps({"emails": [], "raw": output}))
    else:
        print(json.dumps({"emails": [], "error": result.stderr}))
        
except Exception as e:
    print(json.dumps({"emails": [], "error": str(e)}))
    sys.exit(1)
