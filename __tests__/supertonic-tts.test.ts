import { describe, it, expect } from 'vitest';
import { chunkText, cleanText } from '../lib/supertonic-tts';

// ─── cleanText ───────────────────────────────────────────────────────────────

describe('cleanText', () => {
  it('연출 지문 (목소리 낮추며) 등을 제거한다', () => {
    expect(cleanText('안녕하세요. (목소리 낮추며) 오늘도 좋은 하루입니다.')).toBe('안녕하세요. 오늘도 좋은 하루입니다.');
    expect(cleanText('(잠시 쉬고) 계속하겠습니다.')).toBe('계속하겠습니다.');
    expect(cleanText('반갑습니다. (웃음) 오늘 방송 시작합니다.')).toBe('반갑습니다. 오늘 방송 시작합니다.');
  });

  it('이모지를 제거한다', () => {
    expect(cleanText('안녕하세요 🎙 반갑습니다.')).toBe('안녕하세요 반갑습니다.');
  });

  it('변형 선택자(U+FE0F)를 제거한다', () => {
    const withVariant = '방송 중️ 입니다.';
    expect(cleanText(withVariant)).not.toContain('️');
  });

  it('일반 한국어 텍스트(괄호 없음)는 그대로 유지한다', () => {
    const text = '오늘도 좋은 하루 보내세요. 계속합니다.';
    expect(cleanText(text)).toBe(text);
  });

  it('연속 공백을 단일 공백으로 정규화한다', () => {
    expect(cleanText('안녕  하세요')).toBe('안녕 하세요');
  });

  it('앞뒤 공백을 제거한다', () => {
    expect(cleanText('  안녕하세요  ')).toBe('안녕하세요');
  });

  it('이모지 + 변형 선택자 조합을 제거한다', () => {
    const text = '마이크 🎙️ 테스트입니다.';
    const result = cleanText(text);
    expect(result).not.toMatch(/[\uD800-\uDFFF]/);
    expect(result).not.toContain('️');
  });
});

// ─── chunkText ───────────────────────────────────────────────────────────────

describe('chunkText', () => {
  it('짧은 텍스트는 단일 청크로 반환한다', () => {
    const text = '안녕하세요. 오늘도 좋은 하루입니다.';
    const chunks = chunkText(text, 500);
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toBe(text);
  });

  it('maxLen을 초과하면 여러 청크로 분할한다', () => {
    const sentence = '이것은 테스트 문장입니다. ';
    const text = sentence.repeat(20);
    const chunks = chunkText(text, 100);
    expect(chunks.length).toBeGreaterThan(1);
    chunks.forEach((c) => expect(c.length).toBeLessThanOrEqual(200));
  });

  it('빈 청크를 반환하지 않는다', () => {
    const text = '문장 하나. 문장 둘. 문장 셋.';
    const chunks = chunkText(text, 500);
    chunks.forEach((c) => expect(c.trim()).not.toBe(''));
  });

  it('빈 문자열 입력에 빈 배열을 반환한다', () => {
    expect(chunkText('', 500)).toHaveLength(0);
  });

  it('모든 청크를 합치면 원본 텍스트의 내용을 포함한다', () => {
    const text = '첫 번째 문장입니다. 두 번째 문장입니다. 세 번째 문장입니다. 네 번째 문장입니다.';
    const chunks = chunkText(text, 30);
    const joined = chunks.join(' ');
    // 원본 단어들이 모두 포함되어 있어야 함
    ['첫', '두', '세', '네'].forEach((word) => {
      expect(joined).toContain(word);
    });
  });
});

// ─── WAV 헤더 검증 ────────────────────────────────────────────────────────────

describe('WAV 버퍼 구조', () => {
  function makeWav(pcmData: Buffer): Buffer {
    const header = Buffer.alloc(44);
    header.write('RIFF', 0);
    header.writeUInt32LE(pcmData.length + 36, 4);
    header.write('WAVE', 8);
    header.write('fmt ', 12);
    header.writeUInt32LE(16, 16);
    header.writeUInt16LE(1, 20);   // PCM
    header.writeUInt16LE(1, 22);   // mono
    header.writeUInt32LE(22050, 24);
    header.writeUInt32LE(44100, 28);
    header.writeUInt16LE(2, 32);
    header.writeUInt16LE(16, 34);
    header.write('data', 36);
    header.writeUInt32LE(pcmData.length, 40);
    return Buffer.concat([header, pcmData]);
  }

  it('WAV 헤더가 RIFF 시그니처로 시작한다', () => {
    const wav = makeWav(Buffer.from([0x00, 0x01, 0x02, 0x03]));
    expect(wav.slice(0, 4).toString('ascii')).toBe('RIFF');
    expect(wav.slice(8, 12).toString('ascii')).toBe('WAVE');
  });

  it('data chunk 크기가 PCM 데이터 길이와 일치한다', () => {
    const pcm = Buffer.alloc(100);
    const wav = makeWav(pcm);
    const dataSize = wav.readUInt32LE(40);
    expect(dataSize).toBe(100);
  });

  it('RIFF chunk 크기가 data + 36 이다', () => {
    const pcm = Buffer.alloc(200);
    const wav = makeWav(pcm);
    expect(wav.readUInt32LE(4)).toBe(236);
  });
});
