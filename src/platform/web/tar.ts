function text(bytes: Uint8Array): string {
  const end = bytes.indexOf(0);

  return new TextDecoder().decode(end === -1 ? bytes : bytes.slice(0, end));
}

export async function extractTarGzip(
  archive: ArrayBuffer,
): Promise<Map<string, Uint8Array>> {
  const stream = new Blob([archive])
    .stream()
    .pipeThrough(new DecompressionStream('gzip'));
  const tar = new Uint8Array(await new Response(stream).arrayBuffer());
  const files = new Map<string, Uint8Array>();
  let offset = 0;
  let paxPath: string | undefined;

  while (offset + 512 <= tar.length) {
    const header = tar.slice(offset, offset + 512);

    if (header.every((byte) => byte === 0)) {
      break;
    }

    const name = text(header.slice(0, 100));
    const prefix = text(header.slice(345, 500));
    const size = parseInt(text(header.slice(124, 136)).trim() || '0', 8);
    const type = header[156];
    const start = offset + 512;
    const data = tar.slice(start, start + size);
    const headerPath = prefix ? `${prefix}/${name}` : name;

    if (type === 120) {
      const records = new TextDecoder().decode(data).split('\n');
      const pathRecord = records.find((record) => record.includes(' path='));

      paxPath = pathRecord?.slice(pathRecord.indexOf(' path=') + 6);
    } else if (type === 0 || type === 48) {
      files.set(paxPath || headerPath, data);
      paxPath = undefined;
    }

    offset = start + Math.ceil(size / 512) * 512;
  }

  return files;
}
