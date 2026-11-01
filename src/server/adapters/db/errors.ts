/** Thrown by DocumentStore.create when a document with the same id already exists. */
export class DocumentExistsError extends Error {
  readonly code = "ALREADY_EXISTS";
  constructor(collection: string, id: string) {
    super(`Document ${collection}/${id} already exists`);
    this.name = "DocumentExistsError";
  }
}
