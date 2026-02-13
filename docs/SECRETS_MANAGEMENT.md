# Secrets Management Best Practices

**Version:** 1.0  
**Date:** February 13, 2026  
**System:** FailSafe-Qore Runtime & Zo Integration

---

## Overview

This document outlines best practices for managing secrets and sensitive credentials in the FailSafe-Qore system, covering development, staging, and production environments.

---

## Current Implementation

FailSafe-Qore currently uses environment variables for API key storage:

```typescript
// runtime/service/start.ts
const apiKey = process.env.QORE_API_KEY;
```

**Assessment:** This is an **industry-standard approach** for containerized deployments and is **acceptable** with proper security practices.

---

## Security Principles

### 1. Principle of Least Privilege

- Grant minimum necessary access
- Use scoped API keys when possible
- Rotate credentials regularly
- Revoke unused credentials

### 2. Defense in Depth

- Never rely on a single security control
- Layer multiple protection mechanisms
- Assume one control may fail

### 3. Zero Trust

- Verify every request, not just at perimeter
- Validate credentials on each use
- Monitor for anomalous usage patterns

### 4. Secrets as Code

- Treat secrets like any other code dependency
- Version control secrets management
- Automated rotation and revocation

---

## Development Environment

### Acceptable Practices

✅ **Environment Variables**

- Use `.env` files (not committed to version control)
- Document required variables in `.env.example`
- Add `.env` to `.gitignore`
- Use different values for dev/staging/production

✅ **Local Configuration Files**

- Store in `~/.config/failsafe-qore/`
- Set appropriate file permissions (0600)
- Never commit to version control
- Document in README

### Practices to Avoid

❌ **Hardcoded Secrets**

- Never commit API keys to repository
- Never include in code comments
- Never include in documentation
- Never share in screenshots or demos

❌ **Logging Secrets**

- Never log API keys or tokens
- Never include secrets in error messages
- Never include in stack traces
- Use trace IDs for debugging instead

---

## Staging Environment

### Recommended Practices

**Environment Variables with Secret Management**

- Use secret management service (AWS Secrets Manager, HashiCorp Vault)
- Inject secrets at deployment time
- Rotate secrets regularly
- Use short-lived tokens when possible

**Infrastructure as Code**

- Use Terraform/Ansible with secret backends
- Store secrets in encrypted state
- Apply secrets at runtime, not build time
- Enable audit logging

**Access Control**

- Restrict access to staging secrets
- Use IAM roles with least privilege
- Enable MFA for secret access
- Audit access logs regularly

---

## Production Environment

### Recommended Practices

**Dedicated Secrets Management**

- Use AWS Secrets Manager, Azure Key Vault, or HashiCorp Vault
- Encrypt secrets at rest
- Rotate secrets automatically (every 30-90 days)
- Use different secrets per environment

**Secrets Rotation**

- Implement automatic rotation
- Use rotation without service disruption
- Test rotation in staging first
- Document rotation schedule

**Access Control**

- Strict IAM policies for secret access
- Require approval for production access
- Multi-factor authentication required
- Temporary access with expiration

**Monitoring & Auditing**

- Log all secret access (who, when, why)
- Alert on unusual access patterns
- Regular access reviews
- Audit secret usage patterns

---

## API Key Management

### API Key Properties

```typescript
interface ApiKey {
  key: string; // The actual key value
  name: string; // Human-readable identifier
  scopes: string[]; // Permissions granted
  createdAt: Date; // When key was created
  expiresAt: Date; // When key expires (if applicable)
  lastUsedAt: Date; // Last usage timestamp
  revoked: boolean; // Whether key is revoked
}
```

### Key Lifecycle

1. **Generation**
   - Use cryptographically secure random generation
   - Minimum 256 bits of entropy
   - Include expiration date
   - Document purpose and scope

2. **Distribution**
   - Never transmit via email or chat
   - Use secure channels (secret manager, direct handoff)
   - Educate recipient on secure storage
   - Enable immediately after distribution

3. **Usage**
   - Validate on every request
   - Monitor usage patterns
   - Alert on anomalies
   - Log access without exposing key

4. **Rotation**
   - Generate new key before old expires
   - Update configuration with new key
   - Test new key before full rollout
   - Revoke old key after rotation confirmed

5. **Revocation**
   - Immediately revoke compromised keys
   - Revoke unused keys
   - Document revocation reason
   - Audit revocation logs

---

## Environment-Specific Guidelines

### Development

```bash
# .env.example (committed to repo)
QORE_API_KEY=your-dev-api-key-here
QORE_API_HOST=localhost
QORE_API_PORT=17777
```

**Best Practices:**

- Use `.env` file with actual values (not committed)
- Different keys for each developer
- Share keys through secure channels only
- Rotate keys regularly (monthly)

### Staging

```bash
# Injected from secret manager
export QORE_API_KEY=${QORE_API_KEY_STAGING}
export QORE_API_HOST=staging-api.example.com
export QORE_API_PORT=443
```

**Best Practices:**

- Use secret manager (AWS Secrets Manager, Vault)
- Keys scoped to staging environment only
- Auto-rotation enabled
- Monitoring enabled

### Production

```bash
# Injected from secret manager
export QORE_API_KEY=${QORE_API_KEY_PROD}
export QORE_API_HOST=api.example.com
export QORE_API_PORT=443
```

**Best Practices:**

- Use dedicated secret manager
- Keys scoped to production only
- Auto-rotation enabled (30-90 days)
- Multi-factor access required
- Comprehensive audit logging

---

## Secret Rotation Procedures

### Automated Rotation

**Tools:** AWS Secrets Manager, HashiCorp Vault, or equivalent

**Procedure:**

1. Generate new API key
2. Store in secret manager with new version
3. Update application configuration
4. Test new key in staging
5. Deploy to production
6. Monitor for issues
7. Revoke old key after 24-48 hours

**Frequency:**

- Production: Every 30-90 days
- Staging: Every 30 days
- Development: Every 90 days

### Manual Rotation

**When:**

- Key suspected compromised
- Team member with access leaves
- Security audit recommends rotation

**Procedure:**

1. Generate new API key
2. Update secret manager
3. Update application configuration
4. Test new key
5. Deploy to production
6. Revoke old key immediately
7. Audit all systems for old key usage
8. Document rotation in incident log

---

## Monitoring & Alerting

### Key Metrics to Monitor

- **Usage Patterns:** Frequency, timing, volume
- **Failed Authentications:** Rate, patterns, sources
- **Anomalous Access:** Unusual IPs, times, locations
- **Key Age:** Keys approaching expiration
- **Unused Keys:** Keys not used in rotation period

### Alert Thresholds

**Immediate Alerts (Pager):**

- Failed authentication > 10/minute
- Key used from new geographic location
- Key used after revocation
- Unusual usage pattern detected

**Daily Alerts (Email):**

- Key approaching expiration (7 days)
- Unused key detected
- Failed authentication rate increase
- New key generated

**Weekly Alerts (Report):**

- Keys not rotated per policy
- Access without audit trail
- Unusual usage trends

---

## Incident Response

### Key Compromise

1. **Immediate Actions**
   - Revoke compromised key immediately
   - Generate new replacement key
   - Update all affected systems
   - Document incident details

2. **Investigation**
   - Review access logs
   - Identify compromise vector
   - Assess impact scope
   - Check for other compromised keys

3. **Recovery**
   - Rotate all keys in same environment
   - Force password resets if applicable
   - Enhance monitoring for 30 days
   - Update security procedures

### Key Leakage

1. **Immediate Actions**
   - Revoke leaked key immediately
   - Generate new replacement key
   - Search codebase for other leaked secrets
   - Rotate all potentially exposed keys

2. **Investigation**
   - Identify leak source (logs, repos, communications)
   - Assess exposure scope
   - Review access logs during leak window
   - Notify stakeholders

3. **Recovery**
   - Rotate all keys in affected environment
   - Review and update access controls
   - Enhance secrets management practices
   - Conduct security training

---

## Compliance & Auditing

### Regulatory Considerations

- **SOC 2:** Access controls, monitoring, change management
- **PCI DSS:** Key rotation, access controls, logging
- **GDPR:** Data protection, breach notification, right to erasure
- **HIPAA:** Access controls, audit trails, encryption

### Audit Requirements

**Annual Audit:**

- Review all secret access
- Validate rotation compliance
- Assess security procedures
- Update documentation

**Continuous Monitoring:**

- Real-time alerting
- Usage pattern analysis
- Anomaly detection
- Compliance reporting

---

## Tools & Resources

### Recommended Secret Management Tools

**Cloud-Native:**

- AWS Secrets Manager
- Azure Key Vault
- Google Secret Manager
- HashiCorp Vault

**Self-Hosted:**

- Vault (HashiCorp)
- CyberArk Conjur
- Thycotic Secret Server

**Development Tools:**

- direnv (environment variable management)
- git-secrets (Git-based secret storage)
- envchain (multi-environment management)

### Documentation Resources

- OWASP Secrets Management Cheat Sheet
- NIST Special Publication 800-53
- CIS Controls for Secrets Management
- Cloud provider best practices

---

## Checklist

### Pre-Deployment

- [ ] All secrets stored in secret manager
- [ ] Different secrets per environment
- [ ] Access controls configured
- [ ] Monitoring and alerting enabled
- [ ] Rotation schedule defined
- [ ] Incident response procedures documented

### Post-Deployment

- [ ] Secrets injected securely
- [ ] No secrets in logs
- [ ] No secrets in error messages
- [ ] Access audit trail enabled
- [ ] Monitoring dashboard configured
- [ ] Team trained on procedures

### Regular Maintenance

- [ ] Monthly access review
- [ ] Quarterly key rotation audit
- [ ] Annual security assessment
- [ ] Procedure updates based on incidents
- [ ] Training and awareness sessions

---

**Document Owner:** Security Team  
**Last Updated:** February 13, 2026  
**Next Review:** After security audit or quarterly
