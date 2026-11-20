import { gettext } from 'i18n'
import {
  DEFAULT_CONFIG,
  SETTINGS_KEY,
  extractStationId,
  isConfigured,
  normalizeConfig
} from '../utils/constants'

const card = {
  padding: '14px 16px',
  marginBottom: '12px',
  border: '1px solid #e3e7ee',
  borderRadius: '10px',
  backgroundColor: '#ffffff'
}

const hint = {
  fontSize: '12px',
  color: '#7a8494',
  lineHeight: '18px',
  marginTop: '6px'
}

const body = {
  fontSize: '13px',
  color: '#3a4350',
  lineHeight: '19px'
}

function readCfg(props) {
  const raw = props.settingsStorage.getItem(SETTINGS_KEY)
  if (!raw) return normalizeConfig({})
  try {
    return normalizeConfig(JSON.parse(raw))
  } catch (e) {
    return normalizeConfig({})
  }
}

function storeCfg(props, cfg) {
  props.settingsStorage.setItem(SETTINGS_KEY, JSON.stringify(cfg))
}

// Rebuilt from scratch every time so the labels and the result line always
// reflect the current state (the settings page re-renders on every change).
function render(page) {
  const props = page.state.props
  const cfg = page.state.cfg
  const testLine = page.state.testResult

  const savedLine = isConfigured(cfg)
    ? gettext('savedStation') + ' ' + cfg.stationId
    : gettext('notSetYet')

  return View({ style: { padding: '16px', backgroundColor: '#f5f7fa' } }, [
    View({ style: card }, [
      Text({ style: { fontSize: '17px', fontWeight: 'bold', color: '#1a1a1a' } }, [gettext('title')]),
      Text({ style: Object.assign({}, hint, { marginTop: '8px' }) }, [gettext('intro')]),
      View({ style: { marginTop: '10px' } }, [
        TextInput({
          label: gettext('stationId'),
          value: cfg.stationId,
          subStyle: { color: '#1a1a1a', fontSize: '15px' },
          onChange: (val) => {
            page.state.cfg = normalizeConfig(
              Object.assign({}, page.state.cfg, { stationId: extractStationId(val) })
            )
            storeCfg(props, page.state.cfg)
            page.rerender()
          }
        })
      ]),
      View({ style: { marginTop: '8px' } }, [
        TextInput({
          label: gettext('tokenOptional'),
          value: cfg.token,
          subStyle: { color: '#1a1a1a', fontSize: '15px' },
          onChange: (val) => {
            page.state.cfg = normalizeConfig(
              Object.assign({}, page.state.cfg, { token: String(val || '').trim() })
            )
            storeCfg(props, page.state.cfg)
          }
        })
      ]),
      Text({ style: hint }, [gettext('whereToFind')])
    ]),
    View({ style: card }, [
      Select({
        label: gettext('units'),
        value: cfg.units,
        options: [
          { name: gettext('unitsImperial'), value: 'imperial' },
          { name: gettext('unitsMetric'), value: 'metric' }
        ],
        onChange: (val) => {
          page.state.cfg = normalizeConfig(Object.assign({}, page.state.cfg, { units: val }))
          storeCfg(props, page.state.cfg)
          page.rerender()
        }
      })
    ]),
    View({ style: card }, [
      Text({ style: body }, [savedLine]),
      View({ style: { marginTop: '10px' } }, [
        Button({
          label: page.state.testing ? gettext('testing') : gettext('test'),
          style: {
            fontSize: '14px',
            borderRadius: '22px',
            background: page.state.testing ? '#9fb3c8' : '#0d7ea8',
            color: 'white',
            width: '100%'
          },
          onClick: () => page.testConnection()
        })
      ]),
      testLine
        ? Text(
            {
              style: Object.assign({}, hint, {
                color: page.state.testOk ? '#2f6f4f' : '#8a3b2f',
                fontSize: '13px',
                marginTop: '10px'
              })
            },
            [testLine]
          )
        : null
    ]),
    View({ style: card }, [
      Text({ style: body }, [gettext('howToRead')]),
      Text({ style: hint }, [gettext('swipeHint')])
    ])
  ])
}

AppSettingsPage({
  state: {
    props: null,
    cfg: DEFAULT_CONFIG,
    testing: false,
    testOk: false,
    testResult: ''
  },

  rerender() {
    if (!this.state.props || !this.state.props.rerender) return
    this.state.props.rerender()
  },

  // A quick check of the station, run on the phone by the side service.
  testConnection() {
    const cfg = this.state.cfg
    if (!isConfigured(cfg)) {
      this.state.testResult = gettext('enterIdFirst')
      this.rerender()
      return
    }
    // The settings page has no reliable network of its own, so the check is
    // handed to the side service on the phone: it does the HTTP call with the
    // same code the watch uses, and we listen for the answer on the channel.
    this.state.testing = true
    this.state.testResult = gettext('testing')
    this.rerender()
    this.state.props.messageBuilder
      .call({
        method: 'TEST_CONNECTION',
        params: { stationId: extractStationId(cfg.stationId), token: cfg.token }
      })
      .then((res) => {
        this.state.testing = false
        const r = (res && res.result) || {}
        this.state.testOk = !!r.ok
        this.state.testResult = r.message || gettext('errNetwork')
        this.rerender()
      })
      .catch((err) => {
        this.state.testing = false
        this.state.testResult =
          gettext('errNoAnswer') + (err && err.message ? ' (' + err.message + ')' : '')
        this.rerender()
      })
  },

  // Fired when the side service pushes a fresh result for the watch.
  onMessage(msg) {
    if (msg && msg.method === 'TEST_RESULT') {
      this.state.testing = false
      this.state.testOk = !!(msg.params && msg.params.ok)
      this.state.testResult = (msg.params && msg.params.message) || ''
      this.rerender()
    }
  },

  build(props) {
    this.state.props = props
    this.state.cfg = readCfg(props)
    return render(this)
  }
})
