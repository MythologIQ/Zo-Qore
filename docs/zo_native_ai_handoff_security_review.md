# Zo Native AI Handoff Security Review

**Date:** 2026-02-13  
**Reviewer:** Adversarial Security Review  
**Component:** `deploy/zo/install-zo-full.sh` - Zo Native AI Handoff  
**Severity:** Medium-High

---

## Executive Summary

The Zo Native AI handoff feature introduces several security concerns related to secret handling. While the feature provides a convenient way to complete installation when `register_user_service` is unavailable, it exposes sensitive credentials through multiple attack vectors.

---

## Security Findings

### 1. Secrets in Handoff Prompt (HIGH Severity)

**Location:** Lines 479-483 in `print_zo_ai_handoff()` function

**Issue:** The handoff prompt includes actual secret values in environment variables that are displayed to the user:

```bash
- QORE_API_KEY=$(mask_secret "${QORE_API_KEY}")
- QORE_UI_BASIC_AUTH_PASS=$(mask_secret "${QORE_UI_BASIC_AUTH_PASS}")
- QORE_UI_TOTP_SECRET=$(mask_secret "${QORE_UI_TOTP_SECRET}" 6)
- QORE_UI_ADMIN_TOKEN=$(mask_secret "${QORE_UI_ADMIN_TOKEN}")
```

**Analysis:**

- Secrets are masked for display using `mask_secret()` function (only last 4-6 characters shown)
- However, actual secret values are still in the environment variables
- When the user copies the prompt, actual values are included in the copied text
- The masking only affects display, not the actual values in the prompt

**Attack Vectors:**

- **Terminal history**: If shell history is enabled, the prompt with secrets may be logged
- **Clipboard snooping**: Malicious software could read the clipboard while the prompt is there
- **Screen capture**: Malicious software could capture the terminal screen
- **Process inspection**: Other processes could inspect the terminal's memory or file descriptors

**Impact:** HIGH - Secrets are exposed in multiple ways during the handoff process

---

### 2. Secrets in Environment Export (MEDIUM Severity)

**Location:** Lines 596-600 in `main()` function

**Issue:** After displaying the handoff prompt, the script exports secrets to the environment:

```bash
log "export QORE_API_KEY='${QORE_API_KEY}'"
log "export QORE_UI_BASIC_AUTH_USER='${QORE_UI_BASIC_AUTH_USER}'"
log "export QORE_UI_BASIC_AUTH_PASS='${QORE_UI_BASIC_AUTH_PASS}'"
log "export QORE_UI_TOTP_SECRET='${QORE_UI_TOTP_SECRET}'"
log "export QORE_UI_ADMIN_TOKEN='${QORE_UI_ADMIN_TOKEN}'"
```

**Analysis:**

- Secrets are exported in plain text to the shell environment
- These exports are logged to the terminal output
- Any process with access to the environment can read these secrets
- The environment may persist beyond the installation session

**Attack Vectors:**

- **Process inspection**: Other processes can read `/proc/<pid>/environ`
- **Environment dumping**: Commands like `env` or `printenv` can expose secrets
- **Session hijacking**: If the terminal session is compromised, all secrets are exposed

**Impact:** MEDIUM - Secrets are exposed in the shell environment

---

### 3. AI Exposure (HIGH Severity)

**Location:** Handoff prompt content

**Issue:** When the user pastes the prompt into Zo's native AI, secrets are exposed to that AI.

**Analysis:**

- The prompt contains actual secret values (even if masked in display)
- Zo's native AI receives secrets in plain text
- The AI may log the prompt including secrets
- The AI may store the secrets in its memory or context
- The AI may include the secrets in its responses to other users

**Attack Vectors:**

- **AI logging**: Zo's native AI might log the prompt including secrets
- **AI memory**: The secrets might be stored in the AI's long-term memory
- **AI context leakage**: The secrets might be included in responses to other users
- **Model training**: If Zo's native AI is trained on user interactions, secrets could be learned
- **Network interception**: If the prompt is sent over network, it could be intercepted

**Impact:** HIGH - Secrets are exposed to Zo's native AI and potentially to third parties

---

### 4. No Encryption (HIGH Severity)

**Location:** Entire handoff process

**Issue:** Secrets are transmitted in plain text without encryption.

**Analysis:**

- Secrets are not encrypted before being sent to Zo's native AI
- No secure channel is established for secret transmission
- Secrets are visible in plain text in the terminal, clipboard, and AI input

**Attack Vectors:**

- **Network sniffing**: If the prompt is sent over network, it could be intercepted
- **Man-in-the-middle**: An attacker could intercept the prompt transmission
- **AI platform compromise**: If Zo's native AI platform is compromised, all secrets are exposed

**Impact:** HIGH - Secrets are transmitted without protection

---

### 5. No Secure Input Mechanism (MEDIUM Severity)

**Location:** Handoff prompt design

**Issue:** The prompt doesn't use Zo's native AI's secure input mechanisms (if they exist).

**Analysis:**

- Secrets are included directly in the prompt text
- No use of secure input fields or secret management
- Relies on copy-paste mechanism which is inherently insecure

**Attack Vectors:**

- **Clipboard snooping**: Malicious software could read the clipboard
- **Input field spoofing**: If Zo's native AI has secure input fields, they're not being used

**Impact:** MEDIUM - Not leveraging available secure input mechanisms

---

## Mitigation Strategies

### Recommended Mitigations (Priority Order)

#### 1. Use Zo's Secret Management (HIGH Priority)

**Approach:** Store secrets in Zo's secret management system and reference them by name.

**Implementation:**

- Generate secrets using Zo's native AI's secure random generation
- Store secrets in Zo's secret management system
- Reference secrets by name in the handoff prompt
- Never include actual secret values in the prompt

**Example Handoff Prompt:**

```bash
Complete FailSafe-Qore Zo service registration for me.

Repository: ${repo_dir}
Runtime Label: ${RUNTIME_LABEL}
UI Label: ${UI_LABEL}
Runtime Port: ${RUNTIME_PORT}
UI Port: ${UI_PORT}

Secret references (already generated and stored in Zo secret management):
- QORE_API_KEY: zo-secret://failsafe-qore/api-key
- QORE_UI_BASIC_AUTH_USER: admin
- QORE_UI_BASIC_AUTH_PASS: zo-secret://failsafe-qore/ui-password
- QORE_UI_TOTP_SECRET: zo-secret://failsafe-qore/mfa-secret
- QORE_UI_ADMIN_TOKEN: zo-secret://failsafe-qore/admin-token

Steps to complete:
1. Register runtime service with these commands:
   export SERVICE_LABEL="${RUNTIME_LABEL}"
   export SERVICE_PORT="${RUNTIME_PORT}"
   export QORE_API_HOST="${RUNTIME_HOST}"
   export QORE_API_PORT="${RUNTIME_PORT}"
   cd "${repo_dir}"
   bash deploy/zo/register-user-service.sh

2. Register UI service with these commands:
   export UI_LABEL="${UI_LABEL}"
   export UI_PORT="${UI_PORT}"
   export QORE_UI_HOST="${UI_HOST}"
   export RUNTIME_BASE_URL="http://127.0.0.1:${RUNTIME_PORT}"
   cd "${repo_dir}"
   bash deploy/zo/register-ui-user-service.sh

3. Verify services are healthy:
   service_doctor ${RUNTIME_LABEL}
   service_doctor ${UI_LABEL}
   curl -H "x-qore-api-key: zo-secret://failsafe-qore/api-key" http://127.0.0.1:${RUNTIME_PORT}/health

4. Print final URLs:
   echo "Runtime URL: https://${RUNTIME_LABEL}-<zo-host>.zocomputer.io"
   echo "UI URL: https://${UI_LABEL}-<zo-host>.zocomputer.io/ui/console"

Do not stop until both services are registered and healthy. If any step fails,
diagnose and remediate automatically. Retry until success.
```

**Benefits:**

- Secrets never appear in plain text
- Zo's native AI resolves secret references securely
- No clipboard exposure
- No terminal history logging of secrets

**Requirements:**

- Zo's native AI must support secret management
- Zo's native AI must support secret references in prompts

---

#### 2. Generate Secrets After Handoff (MEDIUM Priority)

**Approach:** Have Zo's native AI generate secrets itself.

**Implementation:**

- Remove secret generation from the installer
- Instruct Zo's native AI to generate secrets
- Zo's native AI stores secrets in its secure storage
- Zo's native AI uses secrets for service registration

**Example Handoff Prompt:**

````bash
Complete FailSafe-Qore Zo service registration for me using secure secret generation.

Repository: ${repo_dir}
Runtime Label: ${RUNTIME_LABEL}
UI Label: ${UI_LABEL}
Runtime Port: ${RUNTIME_PORT}
UI Port: ${UI_PORT}

Steps to complete:
1. Generate and store secrets securely:
   Use Zo's secure random generation to create:
   - QORE_API_KEY (32-byte random hex)
   - QORE_UI_BASIC_AUTH_PASS (24-byte random base64)
   - QORE_UI_TOTP_SECRET (Base32 TOTP secret)
   - QORE_UI_ADMIN_TOKEN (32-byte random hex)

   Store these in Zo's secure secret storage.

2. Register runtime service with these commands:
   export SERVICE_LABEL="${RUNTIME_LABEL}"
   export SERVICE_PORT="${RUNTIME_PORT}"
   export QORE_API_HOST="${RUNTIME_HOST}"
   export QORE_API_PORT="${RUNTIME_PORT}"
   export QORE_API_KEY=<reference-to-stored-secret>
   cd "${repo_dir}"
   bash deploy/zo/register-user-service.sh

3. Register UI service with these commands:
   export UI_LABEL="${UI_LABEL}"
   export UI_PORT="${UI_PORT}"
   export QORE_UI_HOST="${UI_HOST}"
   export RUNTIME_BASE_URL="http://127.0.0.1:${RUNTIME_PORT}"
   export QORE_UI_BASIC_AUTH_USER=admin
   export QORE_UI_BASIC_AUTH_PASS=<reference-to-stored-secret>
   export QORE_UI_TOTP_SECRET=<reference-to-stored-secret>
   export QORE_UI_ADMIN_TOKEN=<reference-to-stored-secret>
   cd "${repo_dir}"
   bash deploy/zo/register-ui-user-service.sh

4. Verify services are healthy:
   service_doctor ${RUNTIME_LABEL}
   service_doctor ${UI_LABEL}
   curl -H "x-qore-api-key: <reference-to-stored-secret>" http://127.0.0.1:${RUNTIME_PORT}/health

5. Print final URLs:
   echo "Runtime URL: https://${RUNTIME_LABEL}-<zo-host>.zocomputer.io"
   echo "UI URL: https://${UI_LABEL}-<zo-host>.zocomputer.io/ui/console"

Benefits of this approach:
- Secrets never appear in installer's output
- Zo's native AI handles secret generation securely
- No clipboard exposure
- No terminal history logging of secrets

**Requirements:**
- Zo's native AI must support secure secret generation
- Zo's native AI must support secret storage

---

#### 3. Use Secure Clipboard (LOW Priority)

**Approach:** Warn user about clipboard security and provide alternative methods.

**Implementation:**
- Add warning about clipboard security
- Provide option to use secure paste method
- Clear clipboard after use

**Example Warning:**
```bash
WARNING: The following prompt contains sensitive credentials.
When copying to clipboard, be aware that:
- Malicious software could read clipboard contents
- Clipboard history may retain sensitive data
- Consider using Zo's native AI's secure input instead of copy-paste

If Zo's native AI supports secure input, consider typing
commands manually instead of using copy-paste.
````

**Benefits:**

- Increases user awareness of security risks
- Provides alternative secure methods

---

#### 4. Clear Environment After Handoff (MEDIUM Priority)

**Approach:** Clear secrets from environment after handoff is complete.

**Implementation:**

- Unset secret environment variables after handoff
- Clear shell history if possible
- Provide confirmation that secrets have been cleared

**Example:**

```bash
# After handoff is complete
unset QORE_API_KEY
unset QORE_UI_BASIC_AUTH_USER
unset QORE_UI_BASIC_AUTH_PASS
unset QORE_UI_TOTP_SECRET
unset QORE_UI_ADMIN_TOKEN

# Clear shell history (bash-specific)
history -c

log "Secrets cleared from environment and history"
```

**Benefits:**

- Reduces exposure window for secrets
- Prevents accidental leakage in subsequent commands
- Provides clear security boundary

---

## Comparison of Approaches

| Approach                    | Security    | Convenience | Implementation Complexity | Dependencies                 |
| --------------------------- | ----------- | ----------- | ------------------------- | ---------------------------- |
| Current (secrets in prompt) | LOW         | HIGH        | LOW                       | None                         |
| Zo Secret Management        | HIGH        | MEDIUM      | HIGH                      | Zo secret management support |
| Generate After Handoff      | MEDIUM-HIGH | MEDIUM      | MEDIUM                    | Zo secure secret generation  |
| Secure Clipboard            | LOW-MEDIUM  | MEDIUM      | LOW                       | None                         |
| Clear Environment           | MEDIUM      | MEDIUM      | LOW                       | None                         |

---

## Zo Agent Recognition Guidance

For Zo native AI implementations, consider adding automatic detection of the appropriate approach:

**Detection Logic:**

```javascript
// Pseudo-code for Zo native AI
if (zoPlatform.supportsSecretManagement()) {
  // Use secure approach: secret references
  useSecureHandoffPrompt();
} else if (zoPlatform.supportsSecureInput()) {
  // Use secure input fields instead of clipboard
  useSecureInputFields();
} else {
  // Fallback to clipboard approach with warnings
  useClipboardHandoffWithWarnings();
}
```

**Benefits of Automatic Detection:**

- Zo native AI automatically chooses the most secure available method
- Reduces user error rate (no need to choose between approaches)
- Provides better security posture by default
- Minimizes secret exposure through platform-native mechanisms

**Implementation Considerations:**

- Add capability detection to Zo native AI integration
- Document which methods are supported in each Zo environment
- Provide graceful degradation when secure methods are unavailable
- Log detection results for debugging

**Example Implementation:**

```bash
# In install-zo-full.sh handoff prompt
echo ""
echo "Zo Platform Capabilities Detected:"
echo "  - Secret Management: $(detect_zo_secret_management && echo 'AVAILABLE' || echo 'NOT AVAILABLE')"
echo "  - Secure Input: $(detect_zo_secure_input && echo 'AVAILABLE' || echo 'NOT AVAILABLE')"
echo ""
echo "Recommended approach based on capabilities:"
if detect_zo_secret_management; then
  echo "  ✓ Using secure secret management approach (see below)"
elif detect_zo_secure_input; then
  echo "  ✓ Using secure input fields approach"
else
  echo "  → Using clipboard approach with security warnings"
fi
```

---

## Recommendations

### Immediate Actions (Required)

1. **Document Zo's secret management capabilities** - Determine if Zo's native AI supports secure secret storage and references
2. **Update handoff prompt** - If Zo supports secret management, modify the prompt to use secret references
3. **Add security warnings** - Add warnings about clipboard security and secret exposure
4. **Clear environment** - Unset secret environment variables after handoff is complete

### Future Enhancements (Optional)

1. **Implement secure input detection** - Detect if Zo's native AI supports secure input fields and prefer those
2. **Add encryption option** - Provide option to encrypt secrets before transmission (if Zo supports)
3. **Implement secret rotation** - Automatically rotate secrets after successful installation
4. **Add audit logging** - Log when secrets are accessed or transmitted

---

## Conclusion

The Zo Native AI handoff feature provides significant convenience but introduces several security concerns related to secret handling. The current implementation exposes secrets through multiple attack vectors including clipboard snooping, AI logging, and network interception.

**Recommended Approach:** Use Zo's secret management system (if available) to store and reference secrets by name, rather than including actual secret values in the handoff prompt.

**Risk Acceptance:** If Zo's secret management is not available, the current implementation should be used with clear warnings about security risks and with environment clearing after handoff is complete.

**Zo Agent Enhancement:** Consider implementing automatic detection of Zo platform capabilities to choose the most secure approach automatically, reducing user error rate and improving security posture by default.

---

**Reviewer:** Adversarial Security Review  
**Date:** 2026-02-13  
**Status:** COMPLETED
