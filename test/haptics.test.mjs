import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import test from 'node:test'
import { LoupedeckDisplayId, LoupedeckModelId, LoupedeckVibratePattern } from '@loupedeck/node'
// eslint-disable-next-line n/no-unpublished-import
import { buildHapticFeedbackConfigFields, HapticFeedbackConfigId } from '../dist/config-fields.js'
// eslint-disable-next-line n/no-unpublished-import
import { LoupedeckWrapper } from '../dist/instance.js'
import { supportsHapticFeedback } from '../dist/main.js'

class FakeDeck extends EventEmitter {
	modelName = 'Test Loupedeck'
	controls = []
	vibrateCalls = []
	vibrateResult = undefined
	onBlank = undefined

	async blankDevice() {
		this.onBlank?.()
	}
	async close() {}
	async vibrate(pattern, options) {
		this.vibrateCalls.push({ pattern, options })
		await this.vibrateResult
	}
}

function createWrapper({ supportsHapticFeedback = true } = {}) {
	const deck = new FakeDeck()
	const keys = []
	const context = {
		keyDownById(id) {
			keys.push(['down', id])
		},
		keyUpById(id) {
			keys.push(['up', id])
		},
		rotateLeftById() {},
		rotateRightById() {},
		disconnect() {},
	}
	const wrapper = new LoupedeckWrapper('test-surface', deck, context, false, false, supportsHapticFeedback)
	return { deck, wrapper, keys }
}

function pulse(afterMs) {
	return {
		pattern: LoupedeckVibratePattern.SHARP_CLICK_MEDIUM,
		options: { bestEffort: true, interrupt: { afterMs, pattern: LoupedeckVibratePattern.SHARP_CLICK_LOW } },
	}
}

function touch(id, control) {
	return { changedTouches: [{ id, target: { screen: LoupedeckDisplayId.Center, control: { id: control } } }] }
}

const settle = () => new Promise((resolve) => setImmediate(resolve))

test('allowlists motor-capable models and exposes the default-on settings without touch strips', () => {
	assert.equal(supportsHapticFeedback(LoupedeckModelId.LoupedeckCtV1), true)
	assert.equal(supportsHapticFeedback(LoupedeckModelId.LoupedeckCtV2), true)
	assert.equal(supportsHapticFeedback(LoupedeckModelId.LoupedeckLive), true)
	assert.equal(supportsHapticFeedback(LoupedeckModelId.LoupedeckLiveS), true)
	assert.equal(supportsHapticFeedback(LoupedeckModelId.RazerStreamController), true)
	assert.equal(supportsHapticFeedback(LoupedeckModelId.RazerStreamControllerX), false)
	const enabledField = buildHapticFeedbackConfigFields(true).find((field) => field.id === HapticFeedbackConfigId)
	assert.equal(enabledField?.default, true)
	assert.deepEqual(buildHapticFeedbackConfigFields(false), [])
})

test('a key or touch press reaches Companion and clicks once, only after ready', async () => {
	const { deck, wrapper, keys } = createWrapper()

	deck.emit('down', { id: '0/0' })
	await settle()
	assert.equal(deck.vibrateCalls.length, 0)
	assert.deepEqual(keys, [['down', '0/0']])

	await wrapper.ready()
	deck.emit('down', { id: '0/0' })
	deck.emit('touchstart', touch(1, '1/1'))
	await settle()
	assert.equal(deck.vibrateCalls.length, 1, 'the second click is dropped while the first is in flight')
	assert.deepEqual(deck.vibrateCalls[0], pulse(5))
	assert.deepEqual(keys.slice(1), [
		['down', '0/0'],
		['down', '1/1'],
	])
})

test('intensity selects the interrupt delay and unknown values fall back to medium', async () => {
	const { deck, wrapper } = createWrapper()
	await wrapper.ready()

	for (const intensity of ['light', 'medium', 'strong', 'toString', undefined, null, 3, {}]) {
		await wrapper.updateConfig({ hapticFeedbackIntensity: intensity })
		deck.emit('down', { id: '0/0' })
		deck.emit('up', { id: '0/0' })
		await settle()
	}
	assert.deepEqual(deck.vibrateCalls, [pulse(3), pulse(5), pulse(8), ...Array.from({ length: 5 }, () => pulse(5))])
})

test('a held control clicks again after the hold delay with a slightly longer click', async (t) => {
	t.mock.timers.enable({ apis: ['setTimeout'] })
	const { deck, wrapper } = createWrapper()
	await wrapper.ready()

	for (const intensity of ['light', 'medium', 'strong']) {
		await wrapper.updateConfig({ hapticFeedbackIntensity: intensity })
		deck.vibrateCalls = []
		deck.emit('down', { id: '2/1' })
		await settle()
		t.mock.timers.tick(999)
		await settle()
		assert.equal(deck.vibrateCalls.length, 1, intensity)
		t.mock.timers.tick(1)
		await settle()
		deck.emit('up', { id: '2/1' })
		const [press, hold] = deck.vibrateCalls
		assert.equal(deck.vibrateCalls.length, 2, intensity)
		assert.equal(hold.pattern, press.pattern)
		assert.equal(hold.options.interrupt.pattern, press.options.interrupt.pattern)
		assert.ok(hold.options.interrupt.afterMs > press.options.interrupt.afterMs, intensity)
	}
})

test('releasing before the hold delay cancels the hold click, per control', async (t) => {
	t.mock.timers.enable({ apis: ['setTimeout'] })
	const { deck, wrapper } = createWrapper()
	await wrapper.ready()

	deck.emit('down', { id: '0/0' })
	await settle()
	deck.emit('touchstart', touch(7, '1/1'))
	t.mock.timers.tick(500)
	deck.emit('up', { id: '0/0' })
	t.mock.timers.tick(500)
	await settle()
	assert.equal(deck.vibrateCalls.length, 2, 'only the still-held touch clicks again')
	deck.emit('touchend', touch(7, '1/1'))
	t.mock.timers.tick(5000)
	await settle()
	assert.equal(deck.vibrateCalls.length, 2)
})

test('the hold delay setting applies, and invalid values fall back to one second', async (t) => {
	t.mock.timers.enable({ apis: ['setTimeout'] })
	const { deck, wrapper } = createWrapper()
	await wrapper.ready()

	for (const [delay, expected] of [
		[250, 250],
		['2000', 2000],
		[50, 1000],
		[20000, 1000],
		['soon', 1000],
		[undefined, 1000],
	]) {
		await wrapper.updateConfig({ hapticHoldDelayMs: delay })
		deck.vibrateCalls = []
		deck.emit('down', { id: '0/0' })
		await settle()
		t.mock.timers.tick(expected - 1)
		await settle()
		assert.equal(deck.vibrateCalls.length, 1, `${delay}`)
		t.mock.timers.tick(1)
		await settle()
		assert.equal(deck.vibrateCalls.length, 2, `${delay}`)
		deck.emit('up', { id: '0/0' })
	}
})

test('turning off the hold click or haptics stops hold clicks, including pending ones', async (t) => {
	t.mock.timers.enable({ apis: ['setTimeout'] })
	const { deck, wrapper } = createWrapper()
	await wrapper.ready()

	await wrapper.updateConfig({ hapticHoldClick: false })
	deck.emit('down', { id: '0/0' })
	await settle()
	t.mock.timers.tick(5000)
	await settle()
	assert.equal(deck.vibrateCalls.length, 1, 'the press still clicks')
	deck.emit('up', { id: '0/0' })

	await wrapper.updateConfig({})
	deck.emit('down', { id: '0/0' })
	await settle()
	await wrapper.updateConfig({ hapticFeedback: false })
	t.mock.timers.tick(5000)
	await settle()
	assert.equal(deck.vibrateCalls.length, 2, 'the pending hold click was cancelled')
	deck.emit('up', { id: '0/0' })
	deck.emit('down', { id: '0/0' })
	await settle()
	assert.equal(deck.vibrateCalls.length, 2, 'haptics off means no press click either')
})

test('defaults missing haptic configuration to on and preserves explicit off', async () => {
	const { deck, wrapper } = createWrapper()
	await wrapper.ready()

	for (const [config, expected] of [
		[{}, 1],
		[{ hapticFeedback: false }, 1],
		[{ hapticFeedback: true }, 2],
	]) {
		await wrapper.updateConfig(config)
		deck.emit('down', { id: '0/0' })
		deck.emit('up', { id: '0/0' })
		await settle()
		assert.equal(deck.vibrateCalls.length, expected, JSON.stringify(config))
	}
})

test('drops clicks while a haptic submission is in flight and never replays them', async () => {
	const { deck, wrapper } = createWrapper()
	await wrapper.ready()
	let resolveVibrate
	deck.vibrateResult = new Promise((resolve) => {
		resolveVibrate = resolve
	})

	deck.emit('down', { id: '0/0' })
	deck.emit('down', { id: '0/1' })
	await settle()
	assert.equal(deck.vibrateCalls.length, 1)

	resolveVibrate()
	await settle()
	deck.emit('down', { id: '0/2' })
	await settle()
	assert.equal(deck.vibrateCalls.length, 2)
})

test('contains device errors and stops clicking after close, an error, or on unsupported devices', async (t) => {
	t.mock.timers.enable({ apis: ['setTimeout'] })
	const { deck, wrapper } = createWrapper()
	await wrapper.ready()
	deck.vibrateResult = Promise.reject(new Error('transport failed'))
	deck.vibrateResult.catch(() => null)
	deck.emit('down', { id: '0/0' })
	await settle()
	assert.equal(deck.vibrateCalls.length, 1)

	await wrapper.close()
	t.mock.timers.tick(5000)
	deck.emit('down', { id: '0/1' })
	await settle()
	assert.equal(deck.vibrateCalls.length, 1, 'close cancels the pending hold click and later presses')

	const errored = createWrapper()
	await errored.wrapper.ready()
	errored.deck.emit('down', { id: '0/0' })
	await settle()
	errored.deck.emit('error', new Error('disconnected'))
	t.mock.timers.tick(5000)
	await settle()
	assert.equal(errored.deck.vibrateCalls.length, 1)

	const unsupported = createWrapper({ supportsHapticFeedback: false })
	await unsupported.wrapper.ready()
	unsupported.deck.emit('down', { id: '0/0' })
	t.mock.timers.tick(5000)
	await settle()
	assert.equal(unsupported.deck.vibrateCalls.length, 0)
	assert.deepEqual(unsupported.keys, [['down', '0/0']], 'presses still reach Companion')
})

test('an error before or during init permanently disables haptics for that instance', async () => {
	const beforeInit = createWrapper()
	beforeInit.deck.emit('error', new Error('disconnected'))
	await beforeInit.wrapper.ready()
	beforeInit.deck.emit('down', { id: '0/0' })
	await settle()
	assert.equal(beforeInit.deck.vibrateCalls.length, 0)

	const duringInit = createWrapper()
	duringInit.deck.onBlank = () => duringInit.deck.emit('error', new Error('disconnected'))
	await duringInit.wrapper.init()
	await duringInit.wrapper.ready()
	duringInit.deck.emit('down', { id: '0/0' })
	await settle()
	assert.equal(duringInit.deck.vibrateCalls.length, 0)
})
