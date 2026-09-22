/**
 * K3s 集群内部调用的 Qwen 翻译脚本
 * 服务地址: http://ollama-qwen-svc (已映射 80 端口)
 */

const OLLAMA_BASE_URL = 'http://qwen-service.llama.svc.cluster.local';
const MODEL_NAME = 'qwen2.5:3b';

/**
 * 流式翻译文本函数
 * @param {string} text - 需要翻译的原文
 * @param {function(string): void} onChunk - 收到每个文本片段时的回调函数
 * @param {string} [sourceLang='英文'] - 原语言
 * @param {string} [targetLang='中文'] - 目标语言
 * @returns {Promise<string>} 最终完整的翻译文本
 */
async function translateTextStream(text, onChunk, sourceLang = '英文', targetLang = '中文') {
    const url = `${OLLAMA_BASE_URL}/v1/chat/completions`;

    const requestBody = {
        model: MODEL_NAME,
        messages: [
            {
                role: 'system',
                // content: `你是一位专业且精确的翻译助手。请将输入的${sourceLang}准确翻译为通顺自然、符合表达习惯的${targetLang}。只输出对应的翻译结果，不要输出任何多余解释或前缀。如果文本已经是${targetLang}，则直接回复我 "无需翻译"。`
                // content: `你是一位专业且严谨的语言助手。请识别输入的文本是什么语言, 并直接告诉我对应的语言，不要输入任何多余解释或前缀。如果是多语言混杂难以分辨，直接输出占比最高的语言。`
                content: `你是一位专业且严谨的语言助手。请判断输入的文本是什么语言。
                输出格式必须严格遵循以下 JSON 格式（不要输出任何多余分析或逐字列举）：
                {
                "language": "识别到的语言名称",
                "reason": "简短的判定理由（不超过50字）"
                }
                如果文本全由汉字和中文标点组成，没有平假名（如 あ/い/く）或片假名（如 カ/キ/ク），则必须判定为中文。
                `
            },
            {
                role: 'user',
                content: text
            }
        ],
        temperature: 0.1,
        stream: true,
        options: {
            num_ctx: 2048,
            frequency_penalty: 0.5,
            repeat_penalty: 1.2,
            num_predict: 256
        }
    };

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(requestBody)
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`请求失败 [HTTP ${response.status}]: ${errorText}`);
        }

        let fullText = '';
        const reader = response.body.getReader();
        const decoder = new TextDecoder('utf-8');
        let buffer = '';

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            // 解析 Server-Sent Events (SSE) 数据流
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');

            // 保留未完成的行到 buffer 中
            buffer = lines.pop() || '';

            for (const line of lines) {
                const trimmedLine = line.trim();

                // 忽略空行和 SSE 结束标记
                if (!trimmedLine || trimmedLine === 'data: [DONE]') continue;

                if (trimmedLine.startsWith('data: ')) {
                    try {
                        const jsonStr = trimmedLine.replace(/^data:\s*/, '');
                        const parsed = JSON.parse(jsonStr);
                        const chunk = parsed.choices[0]?.delta?.content || '';

                        if (chunk) {
                            fullText += chunk;
                            if (onChunk && typeof onChunk === 'function') {
                                onChunk(chunk); // 触发打字机回调
                            }
                        }
                    } catch (e) {
                        // 忽略非标准 JSON 解析错误
                    }
                }
            }
        }

        return fullText;
    } catch (error) {
        console.error('\n调用 Ollama 流式翻译接口时出错:', error.message);
        throw error;
    }
}

// ==================== 测试执行 ====================
async function run() {
    const sampleTexts = [
        // 'The system automatically triggers a background worker task upon file upload completion.',
        // 'Kubernetes is an open-source system for automating deployment, scaling, and management of containerized applications.',
        'Error: Failed to bind address 0.0.0.0:80, address already in use.'
        , `人気テレビアニメ「コードギアス　反逆のルルーシュ」を再構成した劇場版3部作の第2部。2006～08年に計2シーズン・全50話が放送されたテレビシリーズに新作パートを加え、全編にわたり新たにアフレコが行われた。仮面の反逆者「ゼロ」として反ブリタニア勢力「黒の騎士団」を率いるルルーシュ。親友のスザクはブリタニア第3皇女ユーフェミアの騎士に任命され、それぞれの立場で力をつけていく2人だったが、ユーフェミアがエリア11副総督として行政特区「日本」の発足を発表し、大きな転機が訪れる。行政特区日本が実現すれば黒の騎士団の存在意義が失われてしまうことから、ルルーシュはユーフェミアとの面会を試みるが……。`
        , `玄关门一打开，眼前冒出了一位小学女生——
“我依照约定来了，请收我为弟子！”
年仅十六岁便拥有将棋界最高头衔“龙王”的九头龙八一家里，出现一位名叫雏鹤爱的小学三年级生，九岁。
“什么？……弟子？你在说什么？”
“……您不记得了吗？”
八一对自己答应过的事情完全没有印象，却展开了与小学女生同居的生活。受到爱直率的热情影响，八一也逐渐取回险些丧失的热忱——`
    ];


    console.log(`🚀 开始调用集群内部 Qwen 服务 [${OLLAMA_BASE_URL}] (流式输出模式)...\n`);

    for (const [index, text] of sampleTexts.entries()) {
        console.log(`--- [示例 ${index + 1}] ---`);
        console.log(`原文: ${text}`);
        process.stdout.write('译文: ');

        const startTime = Date.now();
        try {
            // 传入回调函数，实时将每个 chunk 输出到控制台
            await translateTextStream(text, (chunk) => {
                process.stdout.write(chunk);
            });

            const elapsed = Date.now() - startTime;
            console.log(`\n⏱️ 耗时: ${elapsed} ms\n`);
        } catch (err) {
            console.error(`\n示例 ${index + 1} 翻译失败。\n`);
        }
    }
}

// 启动测试
run();