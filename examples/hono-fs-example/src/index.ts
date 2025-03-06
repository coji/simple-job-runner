import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { logger } from 'hono/logger';
import { createRunner } from 'simple-job-runner';
import { createFSAdapter } from 'simple-job-runner-fs';
import * as fs from 'node:fs';
import * as path from 'node:path';

// Honoアプリケーションの作成
const app = new Hono();
app.use('*', logger());

// ファイルシステムアダプターの作成
// データを./data/jobsディレクトリに保存
const storage = createFSAdapter({
  directory: path.join(process.cwd(), 'data'),
  fs, // Node.jsのfsモジュールを使用
});

// ジョブランナーの作成
const runner = createRunner(storage)
  // PDFレポート生成ジョブ
  .register('generateReport', async ({ reportId, userId, type }) => {
    console.log(
      `[${new Date().toISOString()}] Generating ${type} report ${reportId} for user ${userId}`
    );

    // レポート生成処理のシミュレーション - 実際の処理の場合は実際のPDF生成ロジックをここに
    await new Promise((resolve) => setTimeout(resolve, 5000));

    // 成功時は結果を返す
    return {
      reportUrl: `/reports/${reportId}.pdf`,
      generatedAt: new Date(),
      pages: Math.floor(Math.random() * 20) + 5,
    };
  })

  // データエクスポートジョブ
  .register('exportData', async ({ exportId, format, filters }) => {
    console.log(
      `[${new Date().toISOString()}] Exporting data in ${format} format with filters:`,
      filters
    );

    // ときどき失敗するシミュレーション (テスト用)
    if (Math.random() < 0.3) {
      throw new Error('Random export failure for testing retries');
    }

    // データエクスポート処理のシミュレーション
    await new Promise((resolve) => setTimeout(resolve, 3000));

    // 成功時は結果を返す
    return {
      downloadUrl: `/exports/${exportId}.${format}`,
      recordCount: Math.floor(Math.random() * 1000) + 100,
    };
  })

  // イベントリスナー
  .on('start', (job) => {
    console.log(
      `[${new Date().toISOString()}] Job ${job.id} (${job.name}) started`
    );
  })
  .on('done', (job) => {
    console.log(
      `[${new Date().toISOString()}] Job ${job.id} (${
        job.name
      }) completed with result:`,
      job.result
    );
  })
  .on('failed', (job) => {
    console.error(
      `[${new Date().toISOString()}] Job ${job.id} (${job.name}) failed after ${
        job.attempts
      } attempts. Error: ${job.error}`
    );
  });

// サーバー起動時に未完了ジョブを復旧
async function recoverJobs() {
  try {
    const count = await runner.recover();
    console.log(
      `[${new Date().toISOString()}] Recovered ${count} pending jobs`
    );
  } catch (error) {
    console.error('Error recovering jobs:', error);
  }
}

// ホームページ - ジョブ実行テスト用UI
app.get('/', (c) => {
  return c.html(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Simple Job Runner Demo</title>
      <style>
        body {
          font-family: system-ui, -apple-system, sans-serif;
          line-height: 1.5;
          margin: 0;
          padding: 20px;
          max-width: 800px;
          margin: 0 auto;
        }
        h1, h2 {
          margin-top: 2rem;
          margin-bottom: 1rem;
        }
        .card {
          border: 1px solid #ddd;
          border-radius: 8px;
          padding: 16px;
          margin-bottom: 20px;
          background-color: #f9f9f9;
        }
        .form-group {
          margin-bottom: 16px;
        }
        label {
          display: block;
          margin-bottom: 4px;
          font-weight: bold;
        }
        input, select {
          width: 100%;
          padding: 8px;
          border: 1px solid #ccc;
          border-radius: 4px;
        }
        button {
          background-color: #0066cc;
          color: white;
          border: none;
          border-radius: 4px;
          padding: 8px 16px;
          cursor: pointer;
        }
        button:hover {
          background-color: #0055aa;
        }
        .result {
          margin-top: 16px;
          padding: 12px;
          border-radius: 4px;
          background-color: #eee;
          white-space: pre-wrap;
          font-family: monospace;
          display: none;
        }
        .success {
          background-color: #e6ffec;
          border: 1px solid #56d364;
        }
        .error {
          background-color: #ffebe9;
          border: 1px solid #ff7b72;
        }
      </style>
    </head>
    <body>
      <h1>Simple Job Runner Demo</h1>
      <p>このページからジョブランナーの各種機能を試すことができます。</p>
      
      <h2>レポート生成ジョブ</h2>
      <div class="card">
        <form id="reportForm">
          <div class="form-group">
            <label for="userId">ユーザーID:</label>
            <input type="text" id="userId" name="userId" required>
          </div>
          <div class="form-group">
            <label for="reportType">レポートタイプ:</label>
            <select id="reportType" name="type">
              <option value="standard">標準</option>
              <option value="detailed">詳細</option>
              <option value="summary">サマリー</option>
            </select>
          </div>
          <button type="submit">レポート生成ジョブを追加</button>
        </form>
        <div id="reportResult" class="result"></div>
      </div>
      
      <h2>データエクスポートジョブ</h2>
      <div class="card">
        <form id="exportForm">
          <div class="form-group">
            <label for="format">エクスポート形式:</label>
            <select id="format" name="format">
              <option value="csv">CSV</option>
              <option value="json">JSON</option>
              <option value="xlsx">Excel</option>
            </select>
          </div>
          <div class="form-group">
            <label for="filters">フィルター (JSON):</label>
            <input type="text" id="filters" name="filters" placeholder='{"date":"2023-01-01","status":"active"}'>
          </div>
          <button type="submit">データエクスポートジョブを追加</button>
        </form>
        <div id="exportResult" class="result"></div>
      </div>

      <h2>ジョブ一覧</h2>
      <div class="card">
        <button id="fetchJobs">ジョブ一覧を取得</button>
        <div id="jobsResult" class="result"></div>
      </div>

      <script>
        document.getElementById('reportForm').addEventListener('submit', async (e) => {
          e.preventDefault();
          const userId = document.getElementById('userId').value;
          const type = document.getElementById('reportType').value;
          
          const resultDiv = document.getElementById('reportResult');
          resultDiv.style.display = 'block';
          resultDiv.textContent = 'ジョブを送信中...';
          resultDiv.className = 'result';
          
          try {
            const response = await fetch('/api/reports', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ userId, type })
            });
            
            const data = await response.json();
            resultDiv.textContent = JSON.stringify(data, null, 2);
            
            if (response.ok) {
              resultDiv.classList.add('success');
            } else {
              resultDiv.classList.add('error');
            }
          } catch (error) {
            resultDiv.textContent = 'エラー: ' + error.message;
            resultDiv.classList.add('error');
          }
        });

        document.getElementById('exportForm').addEventListener('submit', async (e) => {
          e.preventDefault();
          const format = document.getElementById('format').value;
          let filters = {};
          
          try {
            const filtersText = document.getElementById('filters').value;
            if (filtersText) {
              filters = JSON.parse(filtersText);
            }
          } catch (error) {
            alert('フィルターの JSON 形式が不正です: ' + error.message);
            return;
          }
          
          const resultDiv = document.getElementById('exportResult');
          resultDiv.style.display = 'block';
          resultDiv.textContent = 'ジョブを送信中...';
          resultDiv.className = 'result';
          
          try {
            const response = await fetch('/api/exports', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ format, filters })
            });
            
            const data = await response.json();
            resultDiv.textContent = JSON.stringify(data, null, 2);
            
            if (response.ok) {
              resultDiv.classList.add('success');
            } else {
              resultDiv.classList.add('error');
            }
          } catch (error) {
            resultDiv.textContent = 'エラー: ' + error.message;
            resultDiv.classList.add('error');
          }
        });

        document.getElementById('fetchJobs').addEventListener('click', async () => {
          const resultDiv = document.getElementById('jobsResult');
          resultDiv.style.display = 'block';
          resultDiv.textContent = 'ジョブを取得中...';
          resultDiv.className = 'result';
          
          try {
            const response = await fetch('/api/jobs');
            const data = await response.json();
            resultDiv.textContent = JSON.stringify(data, null, 2);
            
            if (response.ok) {
              resultDiv.classList.add('success');
            } else {
              resultDiv.classList.add('error');
            }
          } catch (error) {
            resultDiv.textContent = 'エラー: ' + error.message;
            resultDiv.classList.add('error');
          }
        });
      </script>
    </body>
    </html>
  `);
});

// APIエンドポイント

// ジョブ一覧を取得
app.get('/api/jobs', async (c) => {
  try {
    const jobs = await storage.listJobs({ status: ['pending', 'running'] });
    return c.json({ success: true, jobs });
  } catch (error) {
    console.error('Error fetching jobs:', error);
    return c.json(
      {
        success: false,
        error: 'Failed to fetch jobs',
      },
      500
    );
  }
});

// レポート生成ジョブを追加
app.post('/api/reports', async (c) => {
  try {
    const { userId, type = 'standard' } = await c.req.json();

    if (!userId) {
      return c.json({ error: 'userId is required' }, 400);
    }

    // ユニークなレポートIDを生成
    const reportId = `report-${Date.now().toString(36)}`;

    // ジョブを追加
    const job = await runner.add('generateReport', {
      reportId,
      userId,
      type,
    });

    return c.json(
      {
        success: true,
        message: 'Report generation queued',
        reportId,
        jobId: job.id,
      },
      202
    );
  } catch (error) {
    console.error('Error queuing report job:', error);
    return c.json(
      {
        success: false,
        error: 'Failed to queue report generation',
      },
      500
    );
  }
});

// データエクスポートジョブを追加
app.post('/api/exports', async (c) => {
  try {
    const { format = 'csv', filters = {} } = await c.req.json();

    // サポートされているフォーマットのチェック
    if (!['csv', 'json', 'xlsx'].includes(format)) {
      return c.json(
        {
          success: false,
          error: 'Unsupported format. Use csv, json, or xlsx',
        },
        400
      );
    }

    // ユニークなエクスポートIDを生成
    const exportId = `export-${Date.now().toString(36)}`;

    // ジョブを追加 (最大5回の再試行)
    const job = await runner.add(
      'exportData',
      {
        exportId,
        format,
        filters,
      },
      { maxAttempts: 5 }
    );

    return c.json(
      {
        success: true,
        message: 'Data export queued',
        exportId,
        jobId: job.id,
      },
      202
    );
  } catch (error) {
    console.error('Error queuing export job:', error);
    return c.json(
      {
        success: false,
        error: 'Failed to queue data export',
      },
      500
    );
  }
});

// ヘルスチェック
app.get('/health', (c) => {
  return c.json({ status: 'ok' });
});

// サーバー起動
const port = 3000;
console.log(`Starting server on port ${port}...`);

// 起動時にジョブ復旧を実行
recoverJobs().then(() => {
  serve({
    fetch: app.fetch,
    port,
  });

  console.log(
    `[${new Date().toISOString()}] Server started at http://localhost:${port}`
  );
});
