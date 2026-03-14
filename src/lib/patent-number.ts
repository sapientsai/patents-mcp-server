const kindCodePattern = /[-\s]?([A-Z]\d?)$/

const countryPrefixPattern = /^(US|EP|WO|JP|CN|KR|DE|FR|GB|CA|AU)[\s-]*/i

export const normalizePatentNumber = (input: string): string => {
  const trimmed = input.trim()

  let kindCode: string | undefined
  const kindMatch = trimmed.match(kindCodePattern)
  if (kindMatch) {
    kindCode = kindMatch[1]
  }

  const withoutKind = kindCode ? trimmed.slice(0, trimmed.length - kindMatch![0].length) : trimmed

  const withoutPrefix = withoutKind.replace(countryPrefixPattern, "")

  const digitsOnly = withoutPrefix.replace(/[/,\s-]/g, "")

  return kindCode ? `${digitsOnly}${kindCode}` : digitsOnly
}
