import { useDocumentTitle } from '@mantine/hooks'
import { getPlatformNaming } from '@Utils/PlatformNaming'
import { useConfig } from '@Hooks/useConfig'

export const usePageTitle = (title?: string) => {
  const { config, error } = useConfig()

  const naming = getPlatformNaming(config)
  const fallbackTitle = error ? 'GZ::CTF' : naming.websiteTitle
  const suffix = error ? fallbackTitle : naming.pageSubtitle

  useDocumentTitle(typeof title === 'string' && title.trim().length > 0 ? `${title} - ${suffix}` : fallbackTitle)
}
