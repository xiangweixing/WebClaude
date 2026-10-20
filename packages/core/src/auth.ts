import crypto from "node:crypto";

export interface PairingState {
  code: string;
  expiresAt: number;
}

export class AuthManager {
  private currentPairing: PairingState | null = null;
  private validTokens = new Set<string>();
  private failedAttempts = 0;
  private lockoutUntil = 0;

  constructor() {
    this.rotatePairingCode();
  }

  public rotatePairingCode(): string {
    // 6-digit random code
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    this.currentPairing = {
      code,
      expiresAt: Date.now() + 5 * 60 * 1000, // 5 minutes
    };
    return code;
  }

  public getPairingInfo(): { code: string; expiresInSeconds: number } {
    if (!this.currentPairing || Date.now() > this.currentPairing.expiresAt) {
      this.rotatePairingCode();
    }
    const remaining = Math.max(0, Math.floor((this.currentPairing!.expiresAt - Date.now()) / 1000));
    return {
      code: this.currentPairing!.code,
      expiresInSeconds: remaining,
    };
  }

  public pair(code: string): { ok: boolean; token?: string; error?: string } {
    if (Date.now() < this.lockoutUntil) {
      const waitMinutes = Math.ceil((this.lockoutUntil - Date.now()) / 60000);
      return { ok: false, error: `Too many failed attempts. Locked out for ${waitMinutes} more minutes.` };
    }

    if (!this.currentPairing || Date.now() > this.currentPairing.expiresAt) {
      return { ok: false, error: "Pairing code expired. Please check desktop UI for new code." };
    }

    if (code.trim() !== this.currentPairing.code) {
      this.failedAttempts++;
      if (this.failedAttempts >= 5) {
        this.lockoutUntil = Date.now() + 10 * 60 * 1000;
        this.failedAttempts = 0;
        return { ok: false, error: "5 failed attempts reached. Service locked out for 10 minutes." };
      }
      return { ok: false, error: "Invalid pairing code." };
    }

    // Success
    this.failedAttempts = 0;
    const token = crypto.randomBytes(32).toString("hex");
    this.validTokens.add(token);
    // Rotate code immediately after successful pair
    this.rotatePairingCode();

    return { ok: true, token };
  }

  public verifyToken(token: string): boolean {
    if (!token || typeof token !== "string") return false;
    return this.validTokens.has(token.trim());
  }

  public revokeAllTokens(): void {
    this.validTokens.clear();
  }

  public revokeToken(token: string): void {
    this.validTokens.delete(token);
  }

  public getActiveTokenCount(): number {
    return this.validTokens.size;
  }
}
