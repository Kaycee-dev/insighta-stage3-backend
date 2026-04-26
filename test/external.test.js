const test = require('node:test');
const assert = require('node:assert/strict');
const { fetchGenderize, fetchAgify, fetchNationalize, enrichName } = require('../src/services/external');

function stubFetch(handler) {
  const original = global.fetch;
  global.fetch = async (url) => handler(url);
  return () => { global.fetch = original; };
}

test('enrichName calls all three upstreams in parallel', async () => {
  const calls = [];
  const restore = stubFetch(async (url) => {
    calls.push(url);
    if (url.includes('genderize')) {
      return { ok: true, async json() { return { gender: 'female', probability: 0.9, count: 100 }; } };
    }
    if (url.includes('agify')) {
      return { ok: true, async json() { return { age: 30 }; } };
    }
    return { ok: true, async json() { return { country: [{ country_id: 'NG', probability: 0.7 }, { country_id: 'US', probability: 0.2 }] }; } };
  });
  try {
    const r = await enrichName('ada');
    assert.equal(calls.length, 3);
    assert.equal(r.gender, 'female');
    assert.equal(r.age, 30);
    assert.equal(r.country_id, 'NG');
    assert.equal(r.country_probability, 0.7);
    assert.equal(r.sample_size, 100);
  } finally {
    restore();
  }
});

test('Genderize null gender -> UpstreamError', async () => {
  const restore = stubFetch(async () => ({ ok: true, async json() { return { gender: null, probability: 0, count: 0 }; } }));
  try {
    await assert.rejects(fetchGenderize('x'), /Genderize returned an invalid response/);
  } finally { restore(); }
});

test('Agify null age -> UpstreamError', async () => {
  const restore = stubFetch(async () => ({ ok: true, async json() { return { age: null }; } }));
  try {
    await assert.rejects(fetchAgify('x'), /Agify returned an invalid response/);
  } finally { restore(); }
});

test('Nationalize empty country -> UpstreamError', async () => {
  const restore = stubFetch(async () => ({ ok: true, async json() { return { country: [] }; } }));
  try {
    await assert.rejects(fetchNationalize('x'), /Nationalize returned an invalid response/);
  } finally { restore(); }
});

test('Non-2xx upstream -> UpstreamError naming the API', async () => {
  const restore = stubFetch(async () => ({ ok: false, status: 500, async json() { return {}; } }));
  try {
    await assert.rejects(fetchAgify('x'), /Agify returned an invalid response/);
  } finally { restore(); }
});
