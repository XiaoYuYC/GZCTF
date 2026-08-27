import { ClientConfig } from '@Api'

const originalWebsiteTitle = (config?: ClientConfig) => `${config?.title ?? 'GZ'}::CTF`

export const getPlatformNaming = (config?: ClientConfig) => {
  const websiteTitle = originalWebsiteTitle(config)
  const isCustom = config?.namingStyle === 'Custom'

  return {
    isCustom,
    websiteTitle: isCustom && config?.customWebsiteTitle?.trim() ? config.customWebsiteTitle.trim() : websiteTitle,
    headerTitle: isCustom && config?.customHeaderTitle?.trim() ? config.customHeaderTitle.trim() : websiteTitle,
    pageSubtitle:
      isCustom && config?.customPageSubtitle?.trim()
        ? config.customPageSubtitle.trim()
        : (config?.slogan ?? 'Hack for fun not for profit'),
  }
}
