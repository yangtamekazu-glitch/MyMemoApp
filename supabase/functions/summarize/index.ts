import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { text } = await req.json()
    const apiKey = Deno.env.get('GEMINI_API_KEY')

    if (!apiKey) {
      throw new Error("GEMINI_API_KEY is missing")
    }

    const prompt = `あなたは優秀なアシスタントです。ユーザーが作成したメモの内容を読み解き、最も重要なポイントを的確に抽出してください。\n\n【要件】\n1. 以下のメモ内容を、必ず「3行の箇条書き（箇条書き記号：- ）」で要約してください。\n2. 箇条書き1行あたりの文字数は、スマートフォンの画面で読みやすいように短く（おおむね30文字以内）簡潔にまとめてください。\n3. 出力は要約された箇条書きのテキストのみとし、挨拶、前置き、補足説明などは一切含めないでください。\n\n【メモ内容】\n${text}`;

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
      })
    });

    if (!response.ok) {
      throw new Error('Failed to fetch from Gemini API');
    }
    
    const data = await response.json();
    const summary = data.candidates?.[0]?.content?.parts?.[0]?.text;

    return new Response(JSON.stringify({ summary }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error?.message || "Unknown error" }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    })
  }
})
