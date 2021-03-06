/* eslint prefer-rest-params: "off", no-console: "off", arrow-body-style: "off"*/

const { _ } = Cypress
const debug = require('debug')('spec')
const snapshotCommand = require('../plugins/snapshot/snapshotCommand')

/**
 * @type {sinon.SinonMatch}
 */
const match = Cypress.sinon.match

const { stringifyShort } = snapshotCommand

const eventCleanseMap = {
  snapshots: stringifyShort,
  parent: stringifyShort,
  tests: stringifyShort,
  commands: stringifyShort,
  err: stringifyShort,
  body: '[body]',
  wallClockStartedAt: match.date,
  lifecycle: match.number,
  fnDuration: match.number,
  duration: match.number,
  afterFnDuration: match.number,
  wallClockDuration: match.number,
  stack: match.string,
  message: '[error message]',
  sourceMappedStack: match.string,
  parsedStack: match.array,
}

const mochaEventCleanseMap = {
  ...eventCleanseMap,
  start: match.date,
  end: match.date,
}

const spyOn = (obj, prop, fn) => {
  const _fn = obj[prop]

  obj[prop] = function () {
    fn.apply(this, arguments)

    const ret = _fn.apply(this, arguments)

    return ret
  }
}

function createCypress () {
  /**
   * @type {sinon.SinonStub}
   */
  let allStubs
  /**
     * @type {sinon.SinonStub}
     */
  let mochaStubs
  /**
     * @type {sinon.SinonStub}
     */
  let setRunnablesStub

  const enableStubSnapshots = false
  // const enableStubSnapshots = true

  let autCypress

  const getAutCypress = () => autCypress

  const snapshotMochaEvents = () => {
    expect(mochaStubs.args).to.matchSnapshot(mochaEventCleanseMap, name.mocha)
  }

  snapshotCommand.registerInCypress()

  const backupCy = window.cy
  const backupCypress = window.Cypress

  beforeEach(() => {
    window.cy = backupCy
    window.Cypress = backupCypress
  })

  let onInitializedListeners = []

  const onInitialized = function (fn) {
    onInitializedListeners.push(fn)
  }

  /**
   * Spawns an isolated Cypress runner as the AUT, with provided spec/fixture and optional state/config
   * @param {()=>void | {[key:string]: any}} mochaTests
   * @param {{state?: any, config?: any}} opts
   */
  const runIsolatedCypress = (mochaTests, opts = {}) => {
    _.defaultsDeep(opts, {
      state: {},
      config: { video: false },
    })

    return cy.visit('/fixtures/isolated-runner.html#/tests/cypress/fixtures/empty_spec.js')
    .then({ timeout: 60000 }, (win) => {
      win.runnerWs.destroy()

      allStubs = cy.stub().snapshot(enableStubSnapshots)
      mochaStubs = cy.stub().snapshot(enableStubSnapshots)
      setRunnablesStub = cy.stub().snapshot(enableStubSnapshots)

      return new Promise((resolve) => {
        const runIsolatedCypress = () => {
          autCypress.run.restore()

          const emit = autCypress.emit
          const emitMap = autCypress.emitMap
          const emitThen = autCypress.emitThen

          cy.stub(autCypress, 'automation').snapshot(enableStubSnapshots)
          .callThrough()
          .withArgs('clear:cookies')
          .resolves({
            foo: 'bar',
          })
          .withArgs('take:screenshot')
          .resolves({
            path: '/path/to/screenshot',
            size: 12,
            dimensions: { width: 20, height: 20 },
            multipart: false,
            pixelRatio: 1,
            takenAt: new Date().toISOString(),
            name: 'name',
            blackout: ['.foo'],
            duration: 100,
          })

          cy.stub(autCypress, 'emit').snapshot(enableStubSnapshots).log(false)
          .callsFake(function () {
            const noLog = _.includes([
              'navigation:changed',
              'stability:changed',
              'window:load',
              'url:changed',
              'log:added',
              'page:loading',
              'window:unload',
              'newListener',
            ], arguments[0])
            const noCall = _.includes(['window:before:unload', 'mocha'], arguments[0])
            const isMocha = _.includes(['mocha'], arguments[0])

            if (isMocha) {
              mochaStubs.apply(this, arguments)
            }

            noLog || allStubs.apply(this, ['emit'].concat([].slice.call(arguments)))

            return noCall || emit.apply(this, arguments)
          })

          cy.stub(autCypress, 'emitMap').snapshot(enableStubSnapshots).log(false)
          .callsFake(function () {
            allStubs.apply(this, ['emitMap'].concat([].slice.call(arguments)))

            return emitMap.apply(this, arguments)
          })

          cy.stub(autCypress, 'emitThen').snapshot(enableStubSnapshots).log(false)
          .callsFake(function () {
            allStubs.apply(this, ['emitThen'].concat([].slice.call(arguments)))

            return emitThen.apply(this, arguments)
          })

          spyOn(autCypress.mocha.getRunner(), 'fail', (...args) => {
            Cypress.log({
              name: 'Runner Fail',
              message: `${args[1]}`,
              state: 'failed',
              consoleProps: () => {
                return {
                  Error: args[1],
                }
              },
            })
          })

          cy.spy(cy.state('window').console, 'log').as('console_log')
          cy.spy(cy.state('window').console, 'error').as('console_error')

          onInitializedListeners.forEach((fn) => fn(autCypress))
          onInitializedListeners = []

          autCypress.run((failed) => {
            resolve({ failed, mochaStubs, autCypress })
          })
        }

        cy.spy(win.eventManager.reporterBus, 'emit').snapshot(enableStubSnapshots).as('reporterBus')
        cy.spy(win.eventManager.localBus, 'emit').snapshot(enableStubSnapshots).as('localBus')

        cy.stub(win.runnerWs, 'emit').snapshot(enableStubSnapshots)
        .withArgs('watch:test:file')
        .callsFake(() => {
          autCypress = win.Cypress

          cy.stub(autCypress, 'onSpecWindow').snapshot(enableStubSnapshots).callsFake((specWindow) => {
            autCypress.onSpecWindow.restore()

            autCypress.onSpecWindow(specWindow, [
              {
                absolute: 'cypress/fixtures/empty_spec.js',
                relative: 'cypress/fixtures/empty_spec.js',
                relativeUrl: '/__cypress/tests?p=cypress/fixtures/empty_spec.js',
              },
            ])

            generateMochaTestsForWin(specWindow, mochaTests)
            specWindow.before = () => {}
            specWindow.beforeEach = () => {}
            specWindow.afterEach = () => {}
            specWindow.after = () => {}
            specWindow.describe = () => {}
          })

          cy.stub(autCypress, 'run').snapshot(enableStubSnapshots).callsFake(runIsolatedCypress)
        })
        .withArgs('is:automation:client:connected')
        .yieldsAsync(true)

        .withArgs('get:existing:run:state')
        .callsFake((evt, cb) => {
          cb(opts.state)
        })

        .withArgs('backend:request', 'reset:server:state')
        .yieldsAsync({})

        .withArgs('backend:request', 'resolve:url')
        .yieldsAsync({ response: {
          isOkStatusCode: true,
          isHtml: true,
          url: 'http://localhost:3500/fixtures/generic.html',
        } })

        .withArgs('set:runnables')
        .callsFake((...args) => {
          setRunnablesStub(...args)
          _.last(args)()
        })

        // .withArgs('preserve:run:state')
        // .callsFake()

        .withArgs('automation:request')
        .yieldsAsync({ response: {} })

        const c = _.extend({}, Cypress.config(), {
          isTextTerminal: true,
          spec: {
            relative: 'relative/path/to/spec.js',
            absolute: '/absolute/path/to/spec.js',
          },
        }, opts.config)

        c.state = {}

        cy.stub(win.runnerWs, 'on').snapshot(enableStubSnapshots)

        win.Runner.start(win.document.getElementById('app'), window.btoa(JSON.stringify(c)))
      })
    })
  }

  return {
    runIsolatedCypress,
    snapshotMochaEvents,
    onInitialized,
    getAutCypress,

  }
}

const createHooks = (win, hooks = []) => {
  _.each(hooks, (hook) => {
    if (_.isString(hook)) {
      hook = { type: hook }
    }

    let { type, fail, fn } = hook

    if (fn) {
      if (hook.eval) {
        const fnStr = fn.toString()

        const newFn = function () {
          return win.eval(`(${fnStr})`).call(this)
        }

        Object.defineProperty(newFn, 'length', { value: fn.length })
        fn = newFn
      }

      return win[type](fn)
    }

    if (fail) {
      const numFailures = fail

      return win[type](() => {
        if (_.isNumber(fail) && fail-- <= 0) {
          debug(`hook pass after (${numFailures}) failures: ${type}`)
          win.assert(true, type)

          return
        }

        debug(`hook fail: ${type}`)

        win.assert(false, type)

        throw new Error(`hook failed: ${type}`)
      })
    }

    return win[type](() => {
      win.assert(true, type)
      debug(`hook pass: ${type}`)
    })
  })
}

const createTests = (win, tests = []) => {
  _.each(tests, (test) => {
    if (_.isString(test)) {
      test = { name: test }
    }

    let { name, pending, fail, fn, only } = test

    let it = win.it

    if (only) {
      it = it['only']
    }

    if (fn) {
      if (test.eval) {
        const fnStr = fn.toString()

        const newFn = function () {
          return win.eval(`(${fnStr})`).call(this)
        }

        Object.defineProperty(newFn, 'length', { value: fn.length })
        fn = newFn
      }

      return it(name, fn)
    }

    if (pending) {
      return it(name)
    }

    if (fail) {
      return it(name, () => {
        if (_.isNumber(fail) && fail-- === 0) {
          debug(`test pass after retry: ${name}`)
          win.assert(true, name)

          return
        }

        debug(`test fail: ${name}`)
        win.assert(false, name)

        throw new Error(`test fail: ${name}`)
      })
    }

    return it(name, () => {
      debug(`test pass: ${name}`)
      win.assert(true, name)
    })
  })
}

const createSuites = (win, suites = {}) => {
  _.each(suites, (obj, suiteName) => {
    let fn = () => {
      createHooks(win, obj.hooks)
      createTests(win, obj.tests)
      createSuites(win, obj.suites)
    }

    if (_.isFunction(obj)) {
      fn = evalFn(win, obj)
    }

    win.describe(suiteName, fn)
  })
}

const generateMochaTestsForWin = (win, obj) => {
  if (typeof obj === 'function') {
    win.eval(`( ${obj.toString()})()`)

    return
  }

  createHooks(win, obj.hooks)
  createTests(win, obj.tests)
  createSuites(win, obj.suites)
}

const evalFn = (win, fn) => {
  return function () {
    return win.eval(`(${fn.toString()})`).call(this)
  }
}

const cleanseRunStateMap = {
  wallClockStartedAt: new Date(0),
  wallClockDuration: 1,
  fnDuration: 1,
  afterFnDuration: 1,
  lifecycle: 1,
  duration: 1,
  startTime: new Date(0),
  'err.stack': '[err stack]',
  sourceMappedStack: match.string,
  parsedStack: match.array,
}

const shouldHaveTestResults = (expPassed, expFailed) => {
  return ({ failed }) => {
    expect(failed, 'resolve with failure count').eq(failed)
    expPassed = expPassed || '--'
    expFailed = expFailed || '--'
    cy.get('header .passed .num').should('have.text', `${expPassed}`)
    cy.get('header .failed .num').should('have.text', `${expFailed}`)
  }
}

const containText = (text) => {
  return (($el) => {
    expect($el[0]).property('innerText').contain(text)
  })
}

const getRunState = (Cypress) => {
  const currentRunnable = Cypress.cy.state('runnable')
  const currentId = currentRunnable && currentRunnable.id

  const s = {
    currentId,
    tests: Cypress.runner.getTestsState(),
    startTime: Cypress.runner.getStartTime(),
    emissions: Cypress.runner.getEmissions(),
  }

  s.passed = Cypress.runner.countByTestState(s.tests, 'passed')
  s.failed = Cypress.runner.countByTestState(s.tests, 'failed')
  s.pending = Cypress.runner.countByTestState(s.tests, 'pending')
  s.numLogs = Cypress.Log.countLogsByTests(s.tests)

  return _.cloneDeep(s)
}

module.exports = {
  generateMochaTestsForWin,
  createCypress,
  containText,
  cleanseRunStateMap,
  shouldHaveTestResults,
  getRunState,
}
