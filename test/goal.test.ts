/** Goal driver: when it continues, stops, pauses and hits limits. */
import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { BLOCKED, DONE, type Goal, judge, next } from '../src/goal.ts'

const g: Goal = { objective: 'ship it', status: 'active', turns: 0, maxTurns: 3, maxCost: 1, costAtStart: 0 }

test('done needs evidence', () => {
  assert.equal(judge(`all good\n${DONE}\nEvidence: 12 tests passed in vitest`).status, 'done')
  assert.equal(judge(`all good\n**${DONE}**`).status, 'continue')
  assert.equal(judge('I think we are done.').status, 'continue')
})

test('blocked pauses with the reason', () => {
  const r = next(g, `stuck\n${BLOCKED}\nNeed: database password`, 0, false)
  assert.equal(r.goal.status, 'paused')
  assert.match(r.goal.reason ?? '', /database password/u)
  assert.equal(r.prompt, undefined)
})

test('continues until the turn limit', () => {
  let s = g
  let r = next(s, 'step 1 done', 0, false); assert.ok(r.prompt); s = r.goal
  r = next(s, 'step 2 done', 0, false); assert.ok(r.prompt); s = r.goal
  r = next(s, 'step 3 done', 0, false)
  assert.equal(r.goal.status, 'limit')
  assert.equal(r.prompt, undefined)
})

test('cost limit counts only spend since the goal started', () => {
  const r = next({ ...g, costAtStart: 5 }, 'working', 6.2, false)
  assert.equal(r.goal.status, 'limit')
  assert.equal(next({ ...g, costAtStart: 5 }, 'working', 5.4, false).goal.status, 'active')
})

test('a done claim without evidence asks to verify', () => {
  const r = next(g, `done\n${DONE}`, 0, false)
  assert.equal(r.goal.status, 'active')
  assert.match(r.prompt ?? '', /verify it now/u)
})

test('cancel pauses instead of continuing', () => {
  assert.equal(next(g, '', 0, true).goal.status, 'paused')
})
