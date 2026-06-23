import http from 'node:http';
import { SUPERTONIC_VOICES, DEFAULT_SUPERTONIC_VOICE_ID, SUPERTONIC_TTS_CHUNK_SIZE } from './constants';

const SUPERTONIC_HOST = process.env.SUPERTONIC_TTS_URL ?? 'http://localhost:7788';
const BATCH_SIZE = 64;

interface SupertonicBatchRequestItem {
  text: string;
  voice: string;
  lang: string;
  steps: number;
  speed: number;
  response_format: string;
}

interface SupertonicBatchResponseItem {
  audio_base64: string;
  duration_s: number;
  format: string;
  sample_rate: number;
}

interface SupertonicBatchResponse {
  items: SupertonicBatchResponseItem[];
}

// 합성 전 텍스트 정리: 연출 지문 + 이모지 + 변형 선택자 제거
export function cleanText(text: string): string {
  return text
    .replace(/\([^)]{1,50}\)/g, '')             // (목소리 낮추며), (잠시 쉬고) 등 연출 지문
    .replace(/\p{Extended_Pictographic}/gu, '')  // 이모지
    .replace(/[︀-️]/g, '')
    .replace(/�/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// 텍스트를 문장 경계 기준으로 maxLen 이하 청크로 분할
export function chunkText(text: string, maxLen = SUPERTONIC_TTS_CHUNK_SIZE): string[] {
  const sentences = text.split(/(?<=[.!?。\n])\s+/);
  const chunks: string[] = [];
  let current = '';

  for (const s of sentences) {
    if ((current + ' ' + s).trim().length > maxLen && current) {
      chunks.push(current.trim());
      current = s;
    } else {
      current = current ? current + ' ' + s : s;
    }
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks.filter(Boolean);
}

function getVoiceId(voiceId: string): string {
  const found = SUPERTONIC_VOICES.find((v) => v.id === voiceId);
  return found ? found.id : DEFAULT_SUPERTONIC_VOICE_ID;
}

function httpPost(path: string, body: object, timeoutMs = 120_000): Promise<unknown> {
  const url = new URL(SUPERTONIC_HOST);
  const bodyStr = JSON.stringify(body);

  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: url.hostname,
        port: Number(url.port) || 80,
        path,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(bodyStr),
        },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf-8');
          try {
            const json = JSON.parse(text) as unknown;
            if ((res.statusCode ?? 200) >= 400) {
              const msg = (json as { error?: { message?: string } }).error?.message
                ?? (json as { detail?: string }).detail
                ?? text.slice(0, 200);
              reject(new Error(`Supertonic TTS 오류 ${res.statusCode}: ${msg}`));
            } else {
              resolve(json);
            }
          } catch {
            reject(new Error(`응답 파싱 오류: ${text.slice(0, 100)}`));
          }
        });
      }
    );

    req.setTimeout(timeoutMs, () => {
      req.destroy();
      reject(new Error(`Supertonic TTS 타임아웃 (${timeoutMs / 1000}초 초과)`));
    });
    req.on('error', reject);
    req.write(bodyStr);
    req.end();
  });
}


function validateWavBuffer(buf: Buffer, index: number): void {
  if (buf.length < 44) throw new Error(`청크 ${index}: WAV 버퍼가 너무 짧습니다 (${buf.length}bytes)`);
  if (buf.toString('ascii', 0, 4) !== 'RIFF') throw new Error(`청크 ${index}: RIFF 헤더 없음`);
  if (buf.toString('ascii', 8, 12) !== 'WAVE') throw new Error(`청크 ${index}: WAVE 포맷 없음`);
}

function concatWavBuffers(buffers: Buffer[]): Buffer {
  if (buffers.length === 0) throw new Error('WAV 버퍼가 없습니다');
  if (buffers.length === 1) return buffers[0];

  buffers.forEach((b, i) => validateWavBuffer(b, i));

  // 첫 번째 청크 기준으로 샘플레이트·채널 수 일치 여부 확인 (fmt 청크: bytes 20–44)
  const firstFmt = buffers[0].subarray(20, 44);
  for (let i = 1; i < buffers.length; i++) {
    if (!firstFmt.equals(buffers[i].subarray(20, 44))) {
      throw new Error(`청크 ${i}: 오디오 포맷 불일치 (샘플레이트 또는 채널 수가 다름)`);
    }
  }

  const PCM_OFFSET = 44;
  const pcmChunks = buffers.map((b) => b.subarray(PCM_OFFSET));
  const combinedPcm = Buffer.concat(pcmChunks);

  const header = Buffer.from(buffers[0].subarray(0, PCM_OFFSET));
  header.writeUInt32LE(combinedPcm.length, 40);
  header.writeUInt32LE(combinedPcm.length + 36, 4);

  return Buffer.concat([header, combinedPcm]);
}

export async function synthesizeChunksSupertonic(
  chunks: string[],
  voiceId: string,
  steps: number,
  speed: number,
  onProgress: (current: number, total: number) => void
): Promise<Buffer> {
  const resolvedVoice = getVoiceId(voiceId);
  const wavBuffers: Buffer[] = [];

  for (let batchStart = 0; batchStart < chunks.length; batchStart += BATCH_SIZE) {
    const batchChunks = chunks.slice(batchStart, batchStart + BATCH_SIZE);
    onProgress(batchStart, chunks.length);

    const items: SupertonicBatchRequestItem[] = batchChunks.map((text) => ({
      text: cleanText(text),
      voice: resolvedVoice,
      lang: 'ko',
      steps,
      speed,
      response_format: 'wav',
    }));

    const data = (await httpPost('/v1/tts/batch', { items })) as SupertonicBatchResponse;

    for (const item of data.items) {
      wavBuffers.push(Buffer.from(item.audio_base64, 'base64'));
    }
  }

  onProgress(chunks.length, chunks.length);
  return concatWavBuffers(wavBuffers);
}

