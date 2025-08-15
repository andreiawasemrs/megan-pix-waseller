import express from "express";
import dotenv from "dotenv";
import bodyParser from "body-parser";
import cors from "cors";
import axios from "axios";
import OpenAI from "openai";
import mercadopago from "mercadopago";

dotenv.config();
const app = express();
app.use(cors());
app.use(bodyParser.json());

// --- ENV ---
const PORT = process.env.PORT || 3000;
const VERIFY_TOKEN = process.env.VERIFY_TOKEN || "verify_token_demo";
const WHATS_TOKEN = process.env.WHATS_TOKEN || "";
const WHATS_PHONE_ID = process.env.WHATS_PHONE_ID || "";
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";
const BOT_NAME = process.env.BOT_NAME || "Megan";

// Pagamento (Mercado Pago)
const MP_ACCESS_TOKEN = process.env.MP_ACCESS_TOKEN || ""; // Token de produção (ou sandbox)
const MP_SUCCESS_URL = process.env.MP_SUCCESS_URL || "https://example.com/sucesso";
const MP_FAILURE_URL = process.env.MP_FAILURE_URL || "https://example.com/erro";
const MP_NOTIFICATION_URL = process.env.MP_NOTIFICATION_URL || ""; // seu /payments/webhook público

// Frete (modo: tabela|bling)
const FREIGHT_MODE = process.env.FREIGHT_MODE || "tabela";
const FREIGHT_TABLE_JSON = process.env.FREIGHT_TABLE_JSON || ""; // JSON por UF/intervalos de peso
const BLING_API_KEY = process.env.BLING_API_KEY || ""; // se usar Bling futuramente

// --- OpenAI ---
const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

// Config Mercado Pago
if (MP_ACCESS_TOKEN) {
  mercadopago.configure({ access_token: MP_ACCESS_TOKEN });
}

// Memória simples
const memory = new Map();

async function sendWhatsText(to, body) {
  if (!WHATS_TOKEN || !WHATS_PHONE_ID) {
    console.warn("WHATS_TOKEN/WHATS_PHONE_ID não configurados. Simulando envio:", to, body);
    return;
  }
  const url = `https://graph.facebook.com/v20.0/${WHATS_PHONE_ID}/messages`;
  const payload = {
    messaging_product: "whatsapp",
    to,
    type: "text",
    text: { body }
  };
  await axios.post(url, payload, {
    headers: {
      Authorization: `Bearer ${WHATS_TOKEN}`,
      "Content-Type": "application/json"
    }
  });
}

// --- HEALTH ---
app.get("/", (_, res) => res.send("Megan Waseller API+ (frete+pagamento): ok"));

// --- WEBHOOK VERIFY (Cloud API) ---
app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];
  if (mode === "subscribe" && token === VERIFY_TOKEN) {
    return res.status(200).send(challenge);
  }
  return res.sendStatus(403);
});

// Helpers parsing
function parseOrder(text = "") {
  // Ex.: "Kit Alicate 2 un CEP 88200-000" -> { product: "kit alicate", qty: 2, cep: "88200000" }
  const t = text.toLowerCase();
  const qtyMatch = t.match(/(\d+)\s?(un|unid|unidade|unidades|pcs|peças|pçs?)\b/);
  const qty = qtyMatch ? parseInt(qtyMatch[1], 10) : 1;
  const cepMatch = t.replace("-", "").match(/(\d{8})/);
  const cep = cepMatch ? cepMatch[1] : null;
  // Produto: pega tudo antes do número (heurística)
  let product = t;
  if (qtyMatch) product = t.split(qtyMatch[0])[0];
  product = product.replace(/cep.*$/i, "").trim();
  if (!product) product = "kit alicate p/ gaxeta inox 3pçs";
  return { product, qty, cep };
}

// Frete simplificado por tabela (fallback)
function freightByTable(cep, weightKg = 1) {
  // FREIGHT_TABLE_JSON esperado:
  // { "SC": [{"max":1,"price":22}, {"max":5,"price":35}], "SP":[{"max":1,"price":26}, ...] }
  try {
    const table = FREIGHT_TABLE_JSON ? JSON.parse(FREIGHT_TABLE_JSON) : {};
    const uf = guessUF(cep) || "SC";
    const ranges = table[uf] || table["DEFAULT"] || [{ max: 1, price: 29.9 }, { max: 5, price: 39.9 }, { max: 999, price: 89.9 }];
    const r = ranges.find(r => weightKg <= r.max) || ranges[ranges.length-1];
    // Prazo simples por UF
    const prazo = ["SC","PR","RS"].includes(uf) ? "2-4" : ["SP","RJ","MG","ES"].includes(uf) ? "3-6" : "5-9";
    return { price: r.price, prazo };
  } catch(e) {
    return { price: 39.9, prazo: "3-7" };
  }
}

// Heurística tosca por CEP -> UF (faixas aproximadas; ideal usar API correta)
function guessUF(cep) {
  // Somente para fallback visual, troque por uma API/Correios/CEP real.
  if (!cep) return null;
  const start = parseInt(cep.slice(0,2), 10);
  if (start >= 88 && start <= 89) return "SC";
  if (start >= 1 && start <= 19) return "SP";
  if (start >= 20 && start <= 28) return "RJ";
  if (start >= 30 && start <= 39) return "MG";
  if (start >= 40 && start <= 48) return "BA";
  if (start >= 80 && start <= 87) return "PR";
  if (start >= 90 && start <= 99) return "RS";
  return "DEFAULT";
}

// TODO: Exemplo de stub para Bling (ajuste conforme sua conta/endpoint)
// Mantido como função para você substituir pela chamada real.
async function freightByBling({ cep, weightKg=1, widthCm=15, heightCm=6, lengthCm=20 }) {
  if (!BLING_API_KEY) {
    return { ok:false, error:"BLING_API_KEY não configurado" };
  }
  // Ajuste a chamada para o endpoint correto de frete da sua conta.
  // Aqui apenas um stub:
  try {
    // const resp = await axios.get("https://www.bling.com.br/Api/v3/shipping/quote", {
    //   params: { cep, weight: weightKg, width: widthCm, height: heightCm, length: lengthCm },
    //   headers: { "Authorization": `Bearer ${BLING_API_KEY}` }
    // });
    // return { ok:true, price: resp.data?.price, prazo: resp.data?.prazo };
    return { ok:true, price: 34.9, prazo: "3-6" };
  } catch (e) {
    return { ok:false, error: e?.response?.data || e.message };
  }
}

async function getFreight({ cep, product="kit", qty=1 }) {
  const weightKg = 1 * qty; // ajuste por item
  if (FREIGHT_MODE === "bling") {
    const r = await freightByBling({ cep, weightKg });
    if (r.ok) return { price: r.price, prazo: r.prazo };
    // fallback
  }
  return freightByTable(cep, weightKg);
}

function money(n) {
  return n.toLocaleString("pt-BR", { style:"currency", currency:"BRL" });
}

// --- WEBHOOK RECEIVE (Cloud API -> Nosso servidor) ---
app.post("/webhook", async (req, res) => {
  try {
    const entry = req.body.entry?.[0];
    const changes = entry?.changes?.[0];
    const msgs = changes?.value?.messages;

    if (msgs && msgs.length > 0) {
      const msg = msgs[0];
      const from = msg.from;
      const type = msg.type;
      let textIn = "";
      if (type === "text") textIn = msg.text?.body || "";
      if (type === "interactive") {
        const i = msg.interactive;
        if (i?.type === "button_reply") textIn = i.button_reply?.title || "";
        if (i?.type === "list_reply") textIn = i.list_reply?.title || "";
      }

      // Hist.
      if (!memory.has(from)) {
        memory.set(from, [
          { role: "system", content: `Você é ${BOT_NAME}, atendente da MGF Store. Fale pt-BR. Venda ferramentas (nacional, inox 304, reforçado). Se pedirem orçamento: peça produto, quantidade e CEP. Ofereça Pix -5% e Cartão 3x. Prazo de envio: pedidos até 16h.` }
        ]);
      }
      const history = memory.get(from);
      const lower = (textIn || "").trim().toLowerCase();

      // Menu rápido
      if (["menu", "opcoes", "opções", "1", "2", "3"].includes(lower)) {
        const menu = "Como posso ajudar?\n1) 🧾 Orçamento\n2) 🚚 Prazo/Frete\n3) 👩‍💼 Humano";
        await sendWhatsText(from, menu);
        return res.sendStatus(200);
      }

      // Se mensagem contiver CEP/produto/quantidade, tenta orçamento automático
      const { product, qty, cep } = parseOrder(textIn);
      let triedAuto = false;
      if (cep) {
        triedAuto = true;
        const unit = 397.0; // preço base do kit (ajuste por produto)
        const subtotal = unit * qty;
        const { price: frete, prazo } = await getFreight({ cep, product, qty });
        const total = subtotal + frete;

        const resumo = 
`Produto: ${product}
Preço unit.: ${money(unit)}
Qtd: ${qty} → Subtotal: ${money(subtotal)}
Frete p/ ${cep}: ${money(frete)} | Prazo: ${prazo} dias úteis
**Total:** ${money(total)}
Como prefere pagar?
• Pix com 5% OFF
• Cartão em até 3x
• Boleto à vista`;

        await sendWhatsText(from, resumo);
        // Gera links de pagamento
        try {
          const pref = await mercadopago.preferences.create({
            items: [
              { title: product, quantity: qty, unit_price: unit, currency_id: "BRL" },
            ],
            notification_url: MP_NOTIFICATION_URL || undefined,
            back_urls: {
              success: MP_SUCCESS_URL,
              failure: MP_FAILURE_URL,
              pending: MP_SUCCESS_URL
            },
            auto_return: "approved",
            statement_descriptor: "MGF STORE",
            metadata: { from, cep, product, qty, frete }
          });
          const payMsg = `Link de pagamento (Cartão/Boleto): ${pref.body.init_point}\nSe preferir Pix com 5% OFF, me avise que já gero e te mando o QR.`;
          await sendWhatsText(from, payMsg);
        } catch (e) {
          console.error("MP create pref error:", e?.response?.data || e.message);
          await sendWhatsText(from, "Não consegui gerar o link agora 😣. Quer que eu tente novamente ou envio Pix?");
        }
      }

      // IA como fallback/chat
      history.push({ role: "user", content: textIn });
      let aiText = triedAuto ? "Se quiser, posso reservar esse valor por 24h e garantir o brinde de hoje 🔧" : "Certo! Quer orçamento? Me diga produto, quantidade e CEP 😉";
      try {
        const completion = await openai.chat.completions.create({
          model: "gpt-5.1-mini",
          temperature: 0.2,
          max_tokens: 250,
          messages: history
        });
        aiText = completion.choices?.[0]?.message?.content?.trim() || aiText;
      } catch (e) {
        console.error("OpenAI error:", e?.response?.data || e.message);
      }

      history.push({ role: "assistant", content: aiText });
      memory.set(from, history);
      await sendWhatsText(from, aiText);
    }

    res.sendStatus(200);
  } catch (e) {
    console.error("webhook error:", e?.response?.data || e.message);
    res.sendStatus(200);
  }
});

// --- WASSELLER INTEGRATION (HTTP CALL) ---
app.post("/waseller-in", async (req, res) => {
  try {
    const { to, text } = req.body || {};
    if (!to || !text) return res.status(400).json({ ok: false, error: "to/text obrigatórios" });

    const { product, qty, cep } = parseOrder(text);
    let msg = `Recebi: "${text}"\nProduto: ${product}\nQtd: ${qty}`;
    if (cep) {
      const unit = 397.0;
      const subtotal = unit * qty;
      const { price: frete, prazo } = await getFreight({ cep, product, qty });
      const total = subtotal + frete;
      msg += `\nFrete p/ ${cep}: ${money(frete)} | Prazo: ${prazo} dias úteis\nTotal: ${money(total)}`;

      // Cria preferência MP
      if (MP_ACCESS_TOKEN) {
        try {
          const pref = await mercadopago.preferences.create({
            items: [{ title: product, quantity: qty, unit_price: unit, currency_id: "BRL" }],
            notification_url: MP_NOTIFICATION_URL || undefined,
            back_urls: { success: MP_SUCCESS_URL, failure: MP_FAILURE_URL, pending: MP_SUCCESS_URL },
            auto_return: "approved",
            metadata: { to, cep, product, qty, frete }
          });
          msg += `\nPagamento (Cartão/Boleto): ${pref.body.init_point}`;
        } catch (e) {
          console.error("MP create pref error:", e?.response?.data || e.message);
          msg += `\nNão consegui gerar link MP agora.`;
        }
      }
    } else {
      msg += `\nPara calcular frete/prazo, me envie o **CEP** 😉`;
    }

    await sendWhatsText(to, msg);
    return res.json({ ok: true, sent: true, preview: msg });
  } catch (e) {
    console.error("waseller-in error:", e?.message);
    return res.status(500).json({ ok: false, error: e?.message });
  }
});

// --- Endpoint para criar um link de pagamento "sob demanda" ---
app.post("/payments/create", async (req, res) => {
  try {
    const { title="Pedido MGF", qty=1, unit=1, to, cep } = req.body || {};
    if (!MP_ACCESS_TOKEN) return res.status(400).json({ ok:false, error:"MP_ACCESS_TOKEN não configurado" });
    const pref = await mercadopago.preferences.create({
      items: [{ title, quantity: qty, unit_price: unit, currency_id: "BRL" }],
      notification_url: MP_NOTIFICATION_URL || undefined,
      back_urls: { success: MP_SUCCESS_URL, failure: MP_FAILURE_URL, pending: MP_SUCCESS_URL },
      auto_return: "approved",
      statement_descriptor: "MGF STORE",
      metadata: { to, cep }
    });
    return res.json({ ok:true, init_point: pref.body.init_point, id: pref.body.id });
  } catch (e) {
    return res.status(500).json({ ok:false, error: e?.response?.data || e.message });
  }
});

// --- Webhook de pagamento (recebe notificações do Mercado Pago) ---
app.post("/payments/webhook", async (req, res) => {
  try {
    // Mercado Pago envia diferentes formatos; apenas registramos e respondemos 200.
    console.log("MP Webhook:", JSON.stringify(req.body));
    // Aqui você pode: consultar status pelo ID, atualizar pedido, disparar mensagem Whats.
    res.sendStatus(200);
  } catch (e) {
    res.sendStatus(200);
  }
});

// --- Endpoint de envio simples ---
app.post("/send", async (req, res) => {
  try {
    const { to, body } = req.body || {};
    if (!to || !body) return res.status(400).json({ ok: false, error: "to/body obrigatórios" });
    await sendWhatsText(to, body);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: e?.message });
  }
});

app.listen(PORT, () => console.log(`Megan Waseller API+ rodando na porta ${PORT}`));
