import { readFileSync } from "node:fs";

/**
 * Zentrales Secrets-Management.
 * - Werte kommen aus ENV oder aus Dateien (<NAME>_FILE, z. B. Docker/Kubernetes-Secrets)
 * - Werte werden nie an den Client gegeben; nach außen nur Status (gesetzt/Länge ok)
 */
export const SECRET_SPECS = {
  PLANTOS_SESSION_SECRET: { minLength: 32, purpose: "Signatur der Sitzungs-Cookies" },
  PLANTOS_EDGE_TOKEN: { minLength: 24, purpose: "Authentifizierung der Edge-Agenten" },
  PLANTOS_OIDC_CLIENT_SECRET: { minLength: 8, purpose: "OIDC/Entra-ID Client Secret" },
  PLANTOS_SAP_PASSWORD: { minLength: 8, purpose: "SAP OData Basic-Auth" },
} as const;

export type SecretName = keyof typeof SECRET_SPECS;

export function getSecret(name: SecretName): string | undefined {
  const direct = process.env[name];
  if (direct) return direct;
  const file = process.env[`${name}_FILE`];
  if (file) {
    try {
      return readFileSync(file, "utf8").trim();
    } catch {
      return undefined;
    }
  }
  return undefined;
}

export interface SecretStatus {
  name: SecretName;
  purpose: string;
  configured: boolean;
  strong: boolean;
  viaFile: boolean;
}

export function secretStatus(): SecretStatus[] {
  return (Object.keys(SECRET_SPECS) as SecretName[]).map((name) => {
    const v = getSecret(name);
    return {
      name,
      purpose: SECRET_SPECS[name].purpose,
      configured: !!v,
      strong: !!v && v.length >= SECRET_SPECS[name].minLength,
      viaFile: !process.env[name] && !!process.env[`${name}_FILE`],
    };
  });
}
