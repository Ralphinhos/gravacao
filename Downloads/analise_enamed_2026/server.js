require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { google } = require('googleapis');
const NodeCache = require('node-cache');

const app = express();
app.use(cors());

// Cache de 5 minutos (300 segundos) para evitar bloqueios por excesso de requisições ao Google
const cache = new NodeCache({ stdTTL: 300 });

// ID da Planilha (pego na URL da planilha do Google Sheets)
const SPREADSHEET_ID = process.env.SPREADSHEET_ID;
// Nome da aba exata que contém os dados (ex: 'Página1' ou 'Base')
const SHEET_RANGE = 'Base!A:Z'; 

async function getGoogleSheetsClient() {
    // Para produção no Render, leremos as credenciais de uma variável de ambiente
    const credentials = JSON.parse(process.env.GOOGLE_CREDENTIALS);
    const auth = new google.auth.GoogleAuth({
        credentials,
        scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
    });
    return auth.getClient();
}

app.get('/dados', async (req, res) => {
    try {
        // 1. Verifica se já temos os dados no Cache
        const cachedData = cache.get("enamed_data");
        if (cachedData) {
            return res.json(cachedData);
        }

        // 2. Conecta ao Google Sheets
        const authClient = await getGoogleSheetsClient();
        const sheets = google.sheets({ version: 'v4', auth: authClient });

        const response = await sheets.spreadsheets.values.get({
            spreadsheetId: SPREADSHEET_ID,
            range: SHEET_RANGE,
        });

        const rows = response.data.values;
        if (!rows || rows.length === 0) {
            return res.status(404).json({ error: 'Nenhum dado encontrado na planilha.' });
        }

        // 3. Transforma a Matriz 2D em Array de JSON (imita o comportamento do XLSX.js)
        const headers = rows[0];
        const jsonData = rows.slice(1).map(row => {
            let obj = {};
            headers.forEach((header, index) => {
                // Tipagem básica: se for número, converte, senão mantém string
                let value = row[index] || "";
                if (!isNaN(value) && value !== "") value = Number(value);
                obj[header.trim()] = value;
            });
            return obj;
        });

        // 4. Salva no cache e envia
        cache.set("enamed_data", jsonData);
        res.json(jsonData);

    } catch (error) {
        console.error("Erro ao buscar dados do Sheets:", error);
        res.status(500).json({ error: 'Erro interno ao buscar os dados.' });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Servidor rodando na porta ${PORT}`);
});