import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { cleanPrediction, predictContext } from '../src/predict.ts'

test('cleanPrediction keeps one short line', () => {
  assert.equal(cleanPrediction('Working...\nok làm đi\n'), 'ok làm đi')
  assert.equal(cleanPrediction('"commit và push"'), 'commit và push')
  assert.equal(cleanPrediction('USER: chạy test'), 'chạy test')
  assert.equal(cleanPrediction('-'), '')
  assert.equal(cleanPrediction('x'.repeat(300)), '')
})

test('predictContext takes the tail of prompts and replies only', () => {
  const ctx = predictContext([
    { type: 'user', id: '1', text: 'sửa lỗi' },
    { type: 'tool', id: 't', card: { id: 'c', kind: 'read', name: 'read', title: 'x', status: 'completed' } },
    { type: 'assistant', id: '2', text: 'Đã sửa.' },
  ])
  assert.equal(ctx, 'USER: sửa lỗi\n\nASSISTANT: Đã sửa.')
})
