// Messages are fixed text; they never contain a key, plaintext or input value.

export class InvalidMasterKeyError extends Error {
  override readonly name = "InvalidMasterKeyError";

  constructor(reason: string) {
    super(`Invalid master key: ${reason}`);
  }
}

export class UnknownMasterKeyVersionError extends Error {
  override readonly name = "UnknownMasterKeyVersionError";
  readonly version: number;

  constructor(version: number) {
    super(`No master key loaded for version ${version}`);
    this.version = version;
  }
}

export class ProviderKeyDecryptError extends Error {
  override readonly name = "ProviderKeyDecryptError";

  constructor(options?: { cause?: unknown }) {
    super("Provider key could not be decrypted", options);
  }
}
