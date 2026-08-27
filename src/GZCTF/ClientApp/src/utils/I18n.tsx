import dayjs from 'dayjs'
import 'dayjs/locale/zh'
import localizedFormat from 'dayjs/plugin/localizedFormat'
import { PropsWithChildren, createContext, useContext, useEffect } from 'react'
import { useTranslation } from 'react-i18next'

dayjs.extend(localizedFormat)

interface ExtraLocalFormat {
  SL: string
  SLL: string
  SMY: string
}

const shortLocalFormat = new Map<string, ExtraLocalFormat>([['zh', { SL: 'MM/DD', SLL: 'YY/MM/DD', SMY: 'YYYY年MMM' }]])

dayjs.extend((_o, c, _d) => {
  const proto = c.prototype
  const oldFormat = proto.format

  proto.format = function (fmt: string) {
    const locale = this.locale().split('-')[0]
    const shortLocal = shortLocalFormat.get(locale)
    if (shortLocal) {
      fmt = fmt
        .replace(/SL{1,2}/g, (a) => {
          return shortLocal[a as keyof ExtraLocalFormat]
        })
        .replace(/SMY/g, shortLocal.SMY)
    }
    return oldFormat.call(this, fmt)
  }
})

export const defaultLanguage = 'zh-CN' as const
export let apiLanguage: string = defaultLanguage
export type SupportedLanguages = typeof defaultLanguage

interface LanguageContextValue {
  language: SupportedLanguages
  locale: string
}

const LanguageContext = createContext<LanguageContextValue | undefined>(undefined)

export const LanguageProvider = ({ children }: PropsWithChildren) => {
  const { i18n } = useTranslation()

  useEffect(() => {
    if (i18n.language !== defaultLanguage) {
      void i18n.changeLanguage(defaultLanguage)
    }
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem('language')
    }
    apiLanguage = defaultLanguage
    dayjs.locale('zh')
    document.documentElement.setAttribute('lang', defaultLanguage)
  }, [i18n])

  return (
    <LanguageContext.Provider value={{ language: defaultLanguage, locale: 'zh' }}>{children}</LanguageContext.Provider>
  )
}

export const useLanguage = () => {
  const context = useContext(LanguageContext)
  if (!context) {
    throw new Error('useLanguage must be used within a LanguageProvider')
  }
  return context
}

export const normalizeLanguage = (_language: string) => 'ZH'
