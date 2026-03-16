import { BigQuery } from "@google-cloud/bigquery"

import { config } from "../lib/config"

const DATASET = "patents-public-data.patents.publications"

type BigQueryResult = {
  rows: Record<string, unknown>[]
  totalRows: number
  estimatedBytesProcessed: string
  estimatedCostUsd: string
}

const getBigQueryClient = (): BigQuery => {
  if (config.googleCredentialsJson) {
    return new BigQuery({
      projectId: config.googleCloudProject,
      credentials: config.googleCredentialsJson,
    })
  }
  return new BigQuery({
    projectId: config.googleCloudProject,
    keyFilename: config.googleApplicationCredentials,
  })
}

const estimateCost = (bytes: string): string => {
  const tb = Number(bytes) / 1e12
  if (tb <= 1) return "Free (within 1 TB/month free tier)"
  return `~$${(tb * 5).toFixed(2)} (${tb.toFixed(3)} TB at $5/TB)`
}

const runQuery = async (sql: string, params?: Record<string, unknown>): Promise<BigQueryResult> => {
  const client = getBigQueryClient()

  // Always dry run first to estimate cost
  const [dryRunJob] = await client.createQueryJob({
    query: sql,
    params,
    dryRun: true,
    useLegacySql: false,
  })

  const bytesProcessed = dryRunJob.metadata?.statistics?.totalBytesProcessed ?? "0"
  const costEstimate = estimateCost(bytesProcessed)

  // Execute the actual query
  const [job] = await client.createQueryJob({
    query: sql,
    params,
    useLegacySql: false,
  })

  const [rows] = await job.getQueryResults()

  return {
    rows: rows as Record<string, unknown>[],
    totalRows: rows.length,
    estimatedBytesProcessed: bytesProcessed,
    estimatedCostUsd: costEstimate,
  }
}

export const bigqueryPatentSearch = async (
  query: string,
  fields: string[] = [
    "publication_number",
    "title_localized",
    "abstract_localized",
    "publication_date",
    "assignee_harmonized",
  ],
  limit = 25,
): Promise<BigQueryResult> => {
  const selectedFields = fields.join(", ")
  const sql = `
    SELECT ${selectedFields}
    FROM \`${DATASET}\`
    WHERE EXISTS (SELECT 1 FROM UNNEST(abstract_localized) a WHERE CONTAINS_SUBSTR(a.text, @query))
       OR EXISTS (SELECT 1 FROM UNNEST(title_localized) t WHERE CONTAINS_SUBSTR(t.text, @query))
    ORDER BY publication_date DESC
    LIMIT @limit
  `
  return runQuery(sql, { query, limit })
}

export const bigqueryPatentFamily = async (familyId: string): Promise<BigQueryResult> => {
  const sql = `
    SELECT
      publication_number,
      country_code,
      title_localized,
      publication_date,
      grant_date,
      application_number,
      priority_date
    FROM \`${DATASET}\`
    WHERE family_id = @familyId
    ORDER BY publication_date
  `
  return runQuery(sql, { familyId })
}

export const bigqueryCitationNetwork = async (publicationNumber: string, depth = 1): Promise<BigQueryResult> => {
  if (depth === 1) {
    const sql = `
      SELECT
        p.publication_number AS source,
        c.publication_number AS cited_publication,
        c.category,
        c.type
      FROM \`${DATASET}\` p,
        UNNEST(citation) AS c
      WHERE p.publication_number = @publicationNumber
    `
    return runQuery(sql, { publicationNumber })
  }

  // Depth 2: citations of citations
  const sql = `
    WITH level1 AS (
      SELECT
        p.publication_number AS source,
        c.publication_number AS cited
      FROM \`${DATASET}\` p,
        UNNEST(citation) AS c
      WHERE p.publication_number = @publicationNumber
    ),
    level2 AS (
      SELECT
        l1.cited AS source,
        c.publication_number AS cited
      FROM level1 l1
      JOIN \`${DATASET}\` p ON p.publication_number = l1.cited,
        UNNEST(citation) AS c
    )
    SELECT * FROM level1
    UNION ALL
    SELECT * FROM level2
    LIMIT 500
  `
  return runQuery(sql, { publicationNumber })
}

export const bigqueryCpcAnalytics = async (
  cpcPrefix: string,
  dateFrom?: string,
  dateTo?: string,
): Promise<BigQueryResult> => {
  const dateFilter = [
    dateFrom ? "AND publication_date >= @dateFrom" : "",
    dateTo ? "AND publication_date <= @dateTo" : "",
  ].join(" ")

  const sql = `
    SELECT
      c.code AS cpc_code,
      COUNT(*) AS patent_count,
      COUNT(DISTINCT assignee.name) AS unique_assignees,
      MIN(publication_date) AS earliest_publication,
      MAX(publication_date) AS latest_publication
    FROM \`${DATASET}\` p,
      UNNEST(cpc) AS c,
      UNNEST(assignee_harmonized) AS assignee
    WHERE c.code LIKE @cpcPrefix
      ${dateFilter}
    GROUP BY c.code
    ORDER BY patent_count DESC
    LIMIT 100
  `

  const params: Record<string, unknown> = { cpcPrefix: `${cpcPrefix}%` }
  if (dateFrom) params.dateFrom = Number(dateFrom)
  if (dateTo) params.dateTo = Number(dateTo)

  return runQuery(sql, params)
}
