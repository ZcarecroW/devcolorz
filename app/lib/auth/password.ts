/**
 * Client-side password guidance.
 *
 * Advisory only — the server enforces the length floor and nothing else. That
 * is deliberate: composition rules ("one uppercase, one digit, one symbol")
 * push people toward predictable substitutions like `Passw0rd!`, and current
 * NIST guidance explicitly recommends against them. Length and unpredictability
 * are what matter, so those are what the meter measures and what the copy asks
 * for. Nothing here ever blocks a submission that clears the length minimum,
 * and paste is never prevented.
 */

export interface PasswordScore {
  /** 0–4. Higher is better. */
  score: number
  label: string
  /** The single most useful thing to say about this password. */
  advice: string
  /** Everything worth fixing, most important first. `advice` is its head. */
  problems: string[]
  /** True once the password clears the configured minimum length. */
  acceptable: boolean
}

export interface PasswordOptions {
  minLength?: number
  /**
   * Values the password must not contain — an email address, a site name.
   * A password built from something already on the same screen is not a
   * secret, and it is a mistake people make while distracted.
   */
  context?: string[]
}

/**
 * Passwords common enough that an attacker's first thousand guesses include
 * them. Not a substitute for a real breach corpus — that is the server's job
 * if it ever grows one — but enough to catch the worst offenders while the
 * user is still typing.
 */
const OBVIOUS = new Set([
  'password', 'passwort', '123456', '12345678', '123456789', '1234567890',
  'qwerty', 'qwertz', 'qwertyuiop', 'abc123', 'letmein', 'welcome', 'admin',
  'iloveyou', 'monkey', 'dragon', 'sunshine', 'princess', 'football',
  'baseball', 'trustno1', 'starwars', 'whatever', 'changeme', 'secret',
  'access', 'master', 'shadow', 'superman', 'batman', 'passw0rd', 'p@ssword',
  'devcolorz', 'colorz', 'palette',
])

const LABELS = ['Very weak', 'Weak', 'Fair', 'Strong', 'Very strong']

/**
 * Score a password out of four.
 *
 * The arithmetic is a rough entropy estimate — character classes widen the
 * alphabet, length multiplies it — with penalties for the patterns that make a
 * long password cheap to guess anyway: a single repeated character, a run of
 * sequential keys, or a known-common word with digits bolted on.
 */
export function scorePassword(password: string, options: PasswordOptions | number = {}): PasswordScore {
  const opts = typeof options === 'number' ? { minLength: options } : options
  const minLength = opts.minLength ?? 12
  const length = password.length
  if (length === 0) {
    return {
      score: 0,
      label: LABELS[0],
      advice: 'Enter a password.',
      problems: ['Enter a password.'],
      acceptable: false,
    }
  }

  const lower = password.toLowerCase()
  const stripped = lower.replace(/[^a-z]/g, '')

  if (OBVIOUS.has(lower) || (stripped.length >= 4 && OBVIOUS.has(stripped))) {
    const advice = 'That is one of the most-guessed passwords in existence. Pick something else.'
    return { score: 0, label: LABELS[0], advice, problems: [advice], acceptable: false }
  }

  for (const item of opts.context ?? []) {
    const needle = item.trim().toLowerCase()
    if (needle.length >= 4 && lower.includes(needle)) {
      const advice = 'Do not build the password out of something already on this page.'
      return { score: 0, label: LABELS[0], advice, problems: [advice], acceptable: false }
    }
  }

  let alphabet = 0
  if (/[a-z]/.test(password)) alphabet += 26
  if (/[A-Z]/.test(password)) alphabet += 26
  if (/[0-9]/.test(password)) alphabet += 10
  if (/[^a-zA-Z0-9]/.test(password)) alphabet += 33

  let bits = length * Math.log2(Math.max(2, alphabet))

  // One character repeated, however many times, is one character.
  if (/^(.)\1*$/.test(password)) bits = Math.min(bits, 8)
  // Keyboard runs and counting sequences are in every wordlist.
  if (/(?:abcdef|qwerty|qwertz|asdfgh|zxcvbn|123456|098765)/i.test(password)) bits -= 20
  // A short repeating unit — "abcabcabc" — has the entropy of the unit alone.
  const unit = /^(.{1,4}?)\1{2,}$/.exec(password)
  if (unit) bits = Math.min(bits, unit[1].length * 6)

  const score = bits >= 90 ? 4 : bits >= 70 ? 3 : bits >= 50 ? 2 : bits >= 32 ? 1 : 0
  const acceptable = length >= minLength

  const problems: string[] = []
  if (!acceptable) {
    const short = minLength - length
    problems.push(`${short} more character${short === 1 ? '' : 's'} to go.`)
  }
  if (score <= 1) {
    problems.push(
      'Length beats complexity. Four unrelated words are stronger than a short password with symbols in it.',
    )
  } else if (score === 2) {
    problems.push('Fine. A few more characters would make it genuinely hard to guess.')
  }
  if (problems.length === 0) {
    problems.push(score === 4 ? 'Very strong.' : 'Strong. Nothing more needed.')
  }

  return { score, label: LABELS[score], advice: problems[0], problems, acceptable }
}

/** Tailwind classes for the meter, from weak to strong. */
export const PASSWORD_METER_CLASSES = [
  'bg-destructive',
  'bg-destructive',
  'bg-warning',
  'bg-success',
  'bg-success',
] as const
