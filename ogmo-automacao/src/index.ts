import 'dotenv/config'
import cron from 'node-cron'
import { chromium, type Page } from 'playwright'
import { mkdir, appendFile, open, unlink } from 'node:fs/promises'
import path from 'node:path'
import { randomUUID } from 'node:crypto'

const TZ = 'America/Sao_Paulo'
const URL = process.env.OGMO_URL || 'http://tpa.ogmosuape.com.br/login'
const LOG_DIR = path.resolve('logs')
const ARTIFACT_DIR = path.resolve('artifacts')
const LOCK_FILE = path.resolve('ogmo.lock')
const CRONS = ['10 9 * * *', '10 10 * * *', '10 11 * * *', '40 15 * * *', '40 16 * * *']
const CLOSED_TEXT = 'NÃO TEM CHAMADA ABERTA!'

type Status = 'NO_OPEN_CALL' | 'SELECTION_CLICKED_UNVERIFIED' | 'CONFIRMED' | 'FAILED' | 'SKIPPED_ALREADY_RUNNING'

async function log(runId: string, status: string, details?: string) {
  await mkdir(LOG_DIR, { recursive: true })
  const record = { timestamp: new Date().toISOString(), runId, status, details }
  console.log(JSON.stringify(record))
  await appendFile(path.join(LOG_DIR, 'events.jsonl'), JSON.stringify(record) + '\n')
}

async function clickText(page: Page, text: string) {
  const locator = page.getByText(text, { exact: true }).first()
  await locator.waitFor({ state: 'visible', timeout: 15000 })
  await locator.click()
}

async function noOpenCall(page: Page) {
  return page.getByText(CLOSED_TEXT, { exact: true }).first().isVisible().catch(() => false)
}

async function waitOrClosed(page: Page, milliseconds: number): Promise<boolean> {
  const end = Date.now() + milliseconds
  while (Date.now() < end) {
    if (await noOpenCall(page)) return true
    await page.waitForTimeout(Math.min(500, Math.max(1, end - Date.now())))
  }
  return noOpenCall(page)
}

async function screenshot(page: Page, runId: string, name: string) {
  await mkdir(ARTIFACT_DIR, { recursive: true })
  const file = path.join(ARTIFACT_DIR, `${runId}-${name}.png`)
  await page.screenshot({ path: file, fullPage: true, timeout: 10000 }).catch(() => {})
  return file
}

async function runFlow(runId: string): Promise<Status> {
  if (!process.env.OGMO_USER || !process.env.OGMO_PASSWORD) {
    throw new Error('Configure OGMO_USER e OGMO_PASSWORD no .env')
  }
  const browser = await chromium.launch({ headless: process.env.HEADLESS !== 'false' })
  const context = await browser.newContext({ locale: 'pt-BR' })
  const page = await context.newPage()
  page.setDefaultTimeout(15000)
  try {
    await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 30000 })
    // Seletores provisórios: validar com Playwright Inspector no site real.
    await page.locator('input').nth(0).fill(process.env.OGMO_USER)
    await page.locator('input').nth(1).fill(process.env.OGMO_PASSWORD)
    await clickText(page, 'confirmar')
    await page.waitForURL('**/inicio', { timeout: 30000 })
    await clickText(page, 'escalar-se')
    await page.waitForURL('**/escalacao', { timeout: 30000 })

    if (await noOpenCall(page) || await waitOrClosed(page, 5000)) {
      await screenshot(page, runId, 'sem-chamada')
      return 'NO_OPEN_CALL'
    }
    await clickText(page, 'ESTIVADOR')
    if (await noOpenCall(page) || await waitOrClosed(page, 5000)) {
      await screenshot(page, runId, 'sem-chamada')
      return 'NO_OPEN_CALL'
    }
    if (await noOpenCall(page)) {
      await screenshot(page, runId, 'sem-chamada')
      return 'NO_OPEN_CALL'
    }
    await clickText(page, 'selecionar tudo')
    await page.waitForTimeout(1000)
    await screenshot(page, runId, 'apos-selecionar')

    // Só declara CONFIRMED se o site mostrar uma confirmação conhecida.
    const successText = process.env.SUCCESS_TEXT?.trim()
    if (successText && await page.getByText(successText, { exact: true }).first().isVisible().catch(() => false)) {
      return 'CONFIRMED'
    }
    return 'SELECTION_CLICKED_UNVERIFIED'
  } catch (error) {
    await screenshot(page, runId, 'erro')
    throw error
  } finally {
    await context.close().catch(() => {})
    await browser.close().catch(() => {})
  }
}

async function execute() {
  const runId = randomUUID()
  // Trava exclusiva no sistema de arquivos; funciona entre processos no mesmo host.
  let lock: Awaited<ReturnType<typeof open>>
  try {
    lock = await open(LOCK_FILE, 'wx')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
      await log(runId, 'SKIPPED_ALREADY_RUNNING')
      return
    }
    throw error
  }
  try {
    await lock.writeFile(JSON.stringify({ pid: process.pid, runId, startedAt: new Date().toISOString() }))
    await log(runId, 'STARTED')
    const status = await runFlow(runId)
    await log(runId, status)
  } catch (error) {
    await log(runId, 'FAILED', error instanceof Error ? error.message : String(error))
  } finally {
    await lock.close()
    await unlink(LOCK_FILE).catch(() => {})
  }
}

if (process.argv.includes('--once')) {
  void execute()
} else {
  for (const expression of CRONS) {
    cron.schedule(expression, () => { void execute() }, { timezone: TZ, noOverlap: true })
  }
  console.log(`OGMO scheduler ativo: ${CRONS.join(', ')} (${TZ})`)
}
