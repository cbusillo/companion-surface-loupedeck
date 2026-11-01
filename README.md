# companion-surface-loupedeck

See [HELP.md](./companion/HELP.md) and [LICENSE](./LICENSE)

## Getting started

Executing a `yarn` command should perform all necessary steps to develop the module, if it does not then follow the steps below.

The module can be built once with `yarn build`. This should be enough to get the module to be loadable by companion.

While developing the module, by using `yarn dev` the compiler will be run in watch mode to recompile the files on change.

## Haptic feedback

On supported motor-capable surfaces, haptic feedback is enabled by default for each surface. Clear **Enable haptic feedback** in that surface's settings to turn off every click for that surface without affecting other surfaces. **Haptic feedback intensity** chooses a lighter or stronger click; the feel was tuned on a Loupedeck Live S and may differ on other models.

The surface clicks once on each physical key or touch press. With **Click again while a key is held** on, it clicks again when a key stays down for **Hold click after (ms)** (1000 by default), so a run-while-held button can be felt when its hold time is reached. The surface cannot see whether Companion runs any actions, so the hold click is time-based and plays for any key held that long. The hold click runs slightly longer, because a finger already resting on the key damps it. The motor is shared by the whole device.

The haptic direction was informed by [ninoleto's split-strips v1.2.0](https://github.com/ninoleto/companion-surface-loupedeck-split-strips/tree/v1.2.0).
