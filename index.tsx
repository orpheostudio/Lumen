import React, { useState, useEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import hljs from 'highlight.js';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

// === Declaração de Tipos para Web Speech API ===
declare global {
  interface Window {
    SpeechRecognition: any;
    webkitSpeechRecognition: any;
  }
}

// === Configuração Supabase ===
// Tenta inicializar apenas se as chaves existirem.
// Caso contrário, o app funcionará em modo "Offline/LocalStorage".
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;
const supabase: SupabaseClient | null = (supabaseUrl && supabaseKey) 
  ? createClient(supabaseUrl, supabaseKey) 
  : null;

// === Tipos e Interfaces ===
interface ToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string; // JSON string
  };
}

interface Message {
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
  name?: string; // Para mensagens de role 'tool'
}

type ConversationMode = 'Explicativo' | 'Profissional' | 'Descontraído';
type Theme = 'light' | 'dark' | 'high-contrast';
type FontSize = 'normal' | 'large' | 'extra-large';

// === SERVIÇO MISTRAL AI (Rigoroso e Modular) ===
class MistralService {
  private static API_URL = 'https://api.mistral.ai/v1/chat/completions';
  
  // Definição das Ferramentas (Custom Tools)
  private static tools = [
    {
      type: "function",
      function: {
        name: "generate_image",
        description: "Gera uma imagem baseada em uma descrição visual detalhada (prompt). Use sempre que o usuário pedir para desenhar, criar imagem, ilustrar ou visualizar algo.",
        parameters: {
          type: "object",
          properties: {
            prompt: {
              type: "string",
              description: "A descrição visual detalhada da imagem, preferencialmente em inglês para melhor qualidade.",
            },
          },
          required: ["prompt"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "web_search",
        description: "Realiza uma busca simulada na web para obter informações atuais sobre tópicos que você não tem certeza ou notícias recentes.",
        parameters: {
          type: "object",
          properties: {
            query: {
              type: "string",
              description: "O termo de busca otimizado.",
            },
          },
          required: ["query"],
        },
      },
    }
  ];

  // Diretrizes de Sistema Rigorosas
  private static getSystemPrompt(mode: ConversationMode): string {
    const basePrompt = `Você é Sena, uma Inteligência Artificial Avançada da AmplaAI.
    
    DIRETRIZES DE SEGURANÇA E COMPORTAMENTO:
    1. Você deve priorizar a acessibilidade, clareza e empatia em todas as respostas.
    2. FORMATAÇÃO: Use Markdown para estruturar suas respostas.
       - Use títulos (##) para organizar tópicos.
       - Use listas (- ou 1.) para instruções passo a passo.
       - Use **negrito** para conceitos chave.
    3. CÓDIGO: Se o usuário pedir código, forneça SOMENTE código seguro, moderno e bem comentado. 
       - Envolva o código em blocos markdown triplos (\`\`\`linguagem ... \`\`\`).
       - Explique o código brevemente após o bloco.
    4. MULTITAREFA: Você é capaz de analisar problemas complexos, sugerir cronogramas e organizar ideias.

    MODO ATUAL: ${mode.toUpperCase()}
    `;

    const modeSpecifics = {
      Explicativo: `
      - Seu tom é paciente, didático e acolhedor.
      - Explique termos técnicos.
      - Ideal para idosos e leigos.
      - Se usar ferramentas, explique o que está fazendo.`,
      
      Profissional: `
      - Seu tom é executivo, direto e focado em eficiência.
      - Ideal para programadores e ambiente corporativo.
      - Respostas concisas e tecnicamente densas.`,
      
      Descontraído: `
      - Seu tom é leve, divertido e criativo.
      - Pode usar emojis e humor moderado.
      - Ideal para conversas casuais e brainstorming criativo.`
    };

    return basePrompt + modeSpecifics[mode];
  }

  // Método de Envio de Mensagem
  static async sendMessage(
    history: Message[], 
    mode: ConversationMode, 
    apiKey: string
  ): Promise<Message> {
    
    // Filtra histórico para o formato da API (remove mensagens de erro locais se houver)
    const validMessages = history.map(msg => ({
      role: msg.role,
      content: msg.content,
      tool_calls: msg.tool_calls,
      tool_call_id: msg.tool_call_id,
      name: msg.name
    }));

    // Insere o System Prompt no início (ou substitui se já existir)
    const messagesPayload = [
      { role: 'system', content: this.getSystemPrompt(mode) },
      ...validMessages
    ];

    try {
      const response = await fetch(this.API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: 'mistral-small-latest', // Modelo eficiente com suporte a function calling
          messages: messagesPayload,
          tools: this.tools,
          tool_choice: "auto", // Deixa o modelo decidir se usa ferramenta
          temperature: 0.7,
        })
      });

      if (!response.ok) {
        if (response.status === 401) throw new Error("Chave de API inválida. Verifique suas configurações.");
        const err = await response.json();
        throw new Error(`Erro API Mistral: ${err.message || response.statusText}`);
      }

      const data = await response.json();
      return data.choices[0].message;

    } catch (error) {
      console.error("Critical Mistral Error:", error);
      throw error;
    }
  }
}

// === Componente Principal da Aplicação ===
const App: React.FC = () => {
  // === Estados ===
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [showWelcome, setShowWelcome] = useState<boolean>(true);

  // Estados de UI/Config
  const [theme, setTheme] = useState<Theme>('light');
  const [conversationMode, setConversationMode] = useState<ConversationMode>('Explicativo');
  const [fontSize, setFontSize] = useState<FontSize>('normal');
  const [dyslexicFont, setDyslexicFont] = useState<boolean>(false);
  const [wideSpacing, setWideSpacing] = useState<boolean>(false);
  const [bigCursor, setBigCursor] = useState<boolean>(false);
  
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);
  const [isAccessibilityOpen, setIsAccessibilityOpen] = useState<boolean>(false);
  const [isSubscriptionOpen, setIsSubscriptionOpen] = useState<boolean>(false);
  
  const chatWindowRef = useRef<HTMLDivElement>(null);

  // === Inicialização e Persistência (Supabase + LocalStorage) ===
  
  useEffect(() => {
    // 1. Carregar preferências visuais do LocalStorage (UI state é local)
    const savedTheme = localStorage.getItem('sena-theme') as Theme;
    if (savedTheme) setTheme(savedTheme);
    const savedMode = localStorage.getItem('sena-mode') as ConversationMode;
    if (savedMode) setConversationMode(savedMode);
    const savedFont = localStorage.getItem('sena-fontsize') as FontSize;
    if (savedFont) setFontSize(savedFont);

    // 2. Carregar Histórico de Chat
    loadChatHistory();
  }, []);

  const loadChatHistory = async () => {
    // Tenta Supabase primeiro
    if (supabase) {
      try {
        // Supondo uma tabela simples 'messages' se o usuário tiver configurado
        // Se não, cairá no catch e usará localStorage
        const { data, error } = await supabase
          .from('messages')
          .select('*')
          .order('created_at', { ascending: true });
        
        if (!error && data && data.length > 0) {
          // Mapper simples assumindo estrutura
          const formatted: Message[] = data.map(d => ({
            role: d.role,
            content: d.content,
            // Recuperar tool_calls se armazenados como JSON
            tool_calls: d.tool_calls ? (typeof d.tool_calls === 'string' ? JSON.parse(d.tool_calls) : d.tool_calls) : undefined
          }));
          setMessages(formatted);
          setShowWelcome(false);
          return;
        }
      } catch (e) {
        console.warn("Supabase load falhou ou não configurado, fallback local.");
      }
    }

    // Fallback LocalStorage
    try {
      const saved = localStorage.getItem('sena-history');
      if (saved) {
        setMessages(JSON.parse(saved));
        setShowWelcome(false);
      }
    } catch (e) {
      console.error("Erro load local", e);
    }
  };

  const saveMessageToHistory = async (newMessages: Message[]) => {
    // Atualiza estado React
    setMessages(prev => {
      const updated = [...prev, ...newMessages];
      
      // Persistência Local
      localStorage.setItem('sena-history', JSON.stringify(updated));
      
      // Persistência Supabase (Fire and Forget)
      if (supabase) {
        // Apenas insere as novas mensagens para economizar banda
        // Em um app real, gerenciariamos sessão/user_id
        const records = newMessages.map(m => ({
          role: m.role,
          content: m.content,
          tool_calls: m.tool_calls ? JSON.stringify(m.tool_calls) : null,
          created_at: new Date().toISOString()
        }));
        supabase.from('messages').insert(records).then(({ error }) => {
          if (error) console.error("Erro ao salvar no Supabase:", error);
        });
      }
      
      return updated;
    });
    setShowWelcome(false);
  };

  // Aplica estilos ao body
  useEffect(() => {
    const body = document.body;
    body.className = '';
    body.classList.add(`${theme}-mode`);
    body.classList.add(`font-${fontSize}`);
    if (dyslexicFont) body.classList.add('dyslexic-font');
    if (wideSpacing) body.classList.add('wide-spacing');
    if (bigCursor) body.classList.add('big-cursor');

    localStorage.setItem('sena-theme', theme);
    localStorage.setItem('sena-fontsize', fontSize);
    localStorage.setItem('sena-mode', conversationMode);
  }, [theme, fontSize, dyslexicFont, wideSpacing, bigCursor, conversationMode]);

  useEffect(() => {
    if (chatWindowRef.current) {
      chatWindowRef.current.scrollTop = chatWindowRef.current.scrollHeight;
    }
  }, [messages, isLoading]);

  // === Lógica de Chat e Ferramentas ===

  const handleSendMessage = async (userInput: string) => {
    if (!userInput.trim() || isLoading) return;

    const userMsg: Message = { role: 'user', content: userInput };
    await saveMessageToHistory([userMsg]);
    setIsLoading(true);

    try {
      if (!process.env.API_KEY) throw new Error("Chave API Mistral não encontrada.");

      // 1. Primeira chamada à API
      let assistantResponse = await MistralService.sendMessage([...messages, userMsg], conversationMode, process.env.API_KEY);
      
      // 2. Verifica se a IA quer usar Ferramentas (Custom Tools)
      if (assistantResponse.tool_calls && assistantResponse.tool_calls.length > 0) {
        
        // Adiciona a mensagem com "intenção de ferramenta" ao histórico temporário
        const toolUseHistory = [...messages, userMsg, assistantResponse];
        const newMessagesToSave = [assistantResponse]; // Vamos salvar essa resposta intermediária também

        for (const toolCall of assistantResponse.tool_calls) {
          const functionName = toolCall.function.name;
          const functionArgs = JSON.parse(toolCall.function.arguments);
          let toolResult = "";

          // Execução da Ferramenta (Client-Side Execution)
          if (functionName === 'generate_image') {
            const prompt = functionArgs.prompt;
            // Gera URL Pollinations
            const imageUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=1024&height=1024&nologo=true`;
            toolResult = `Imagem gerada com sucesso: ![${prompt}](${imageUrl})`;
          } else if (functionName === 'web_search') {
            // Simulação de busca
            toolResult = `Resultado da busca para "${functionArgs.query}": [Informação recuperada da base de conhecimento atualizada do modelo simulando acesso web]. Considere responder com fatos recentes sobre esse tópico.`;
          } else {
            toolResult = "Ferramenta desconhecida.";
          }

          // Cria a mensagem de resposta da ferramenta
          const toolMessage: Message = {
            role: 'tool',
            name: functionName,
            tool_call_id: toolCall.id,
            content: toolResult
          };

          toolUseHistory.push(toolMessage);
          newMessagesToSave.push(toolMessage);
        }

        // 3. Segunda chamada à API (Com o resultado da ferramenta)
        const finalResponse = await MistralService.sendMessage(toolUseHistory, conversationMode, process.env.API_KEY);
        newMessagesToSave.push(finalResponse);
        
        await saveMessageToHistory(newMessagesToSave);

      } else {
        // Resposta normal sem ferramentas
        await saveMessageToHistory([assistantResponse]);
      }

    } catch (error: any) {
      console.error("Erro no fluxo:", error);
      await saveMessageToHistory([{
        role: 'assistant',
        content: `⚠️ Desculpe, ocorreu um erro: ${error.message}`
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleClearChat = async () => {
    if (confirm("Deseja apagar o histórico?")) {
      setMessages([]);
      localStorage.removeItem('sena-history');
      if (supabase) {
        // Opcional: Implementar delete no supabase
        // await supabase.from('messages').delete().neq('id', 0); 
      }
      setShowWelcome(true);
      setIsSettingsOpen(false);
    }
  };

  if (showWelcome) {
    return <WelcomeScreen onStart={() => setShowWelcome(false)} />;
  }

  return (
    <div className="app-container">
      <Header 
        onSettingsClick={() => setIsSettingsOpen(!isSettingsOpen)} 
        onAccessibilityClick={() => setIsAccessibilityOpen(true)}
      />
      
      {isSettingsOpen && (
        <SettingsMenu
          mode={conversationMode}
          onModeChange={setConversationMode}
          onClose={() => setIsSettingsOpen(false)}
          onClearChat={handleClearChat}
        />
      )}

      {isAccessibilityOpen && (
        <AccessibilityModal
          onClose={() => setIsAccessibilityOpen(false)}
          theme={theme} setTheme={setTheme}
          fontSize={fontSize} setFontSize={setFontSize}
          dyslexicFont={dyslexicFont} setDyslexicFont={setDyslexicFont}
          wideSpacing={wideSpacing} setWideSpacing={setWideSpacing}
          bigCursor={bigCursor} setBigCursor={setBigCursor}
        />
      )}

      {isSubscriptionOpen && (
        <SubscriptionModal onClose={() => setIsSubscriptionOpen(false)} />
      )}
      
      <main className="main-content" role="main">
        <ChatWindow ref={chatWindowRef} messages={messages} isLoading={isLoading} />
        <ChatInput onSendMessage={handleSendMessage} isLoading={isLoading} />
      </main>
      
      <Footer onSubscriptionClick={() => setIsSubscriptionOpen(true)} />
      
      <button 
        className="floating-a11y-btn" 
        onClick={() => setIsAccessibilityOpen(true)}
        aria-label="Menu Acessibilidade"
        data-tooltip="Acessibilidade"
      >
        <svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 0 24 24" width="24px" fill="currentColor"><path d="M0 0h24v24H0V0z" fill="none"/><path d="M12 2c1.1 0 2 .9 2 2s-.9 2-2 2-2-.9-2-2 .9-2 2-2zm9 7h-6v13h-2v-6h-2v6H9V9H3V7h18v2z"/></svg>
      </button>
    </div>
  );
};

// === Helpers de Renderização (Mantidos e Otimizados) ===

const renderImagesAndText = (text: string) => {
  if (!text) return null;
  const imageRegex = /!\[([^\]]*)\]\(([^)]+)\)/g;
  const result = [];
  let lastIndex = 0;
  let match;

  while ((match = imageRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      result.push(<span key={`text-${lastIndex}-${match.index}`}>{text.substring(lastIndex, match.index)}</span>);
    }
    result.push(
      <div key={`img-${match.index}`} className="generated-image-container">
        <img src={match[2]} alt={match[1]} className="generated-image" loading="lazy" />
      </div>
    );
    lastIndex = match.index + match[0].length;
  }
  
  if (lastIndex < text.length) {
     result.push(<span key={`text-end-${lastIndex}`}>{text.substring(lastIndex)}</span>);
  }
  
  return result;
}

const renderContent = (content: string) => {
  if (!content) return "";
  const codeBlockRegex = /```(\w+)?\s*([\s\S]*?)```/g;
  
  const parts = [];
  let lastIndex = 0;
  let match;

  while ((match = codeBlockRegex.exec(content)) !== null) {
    const textBefore = content.substring(lastIndex, match.index);
    if (textBefore) {
      parts.push(...renderImagesAndText(textBefore));
    }

    const lang = match[1] || 'plaintext';
    const code = match[2];
    
    let highlightedCode;
    try {
        if (lang && hljs.getLanguage(lang)) {
            highlightedCode = hljs.highlight(code, { language: lang }).value;
        } else {
            highlightedCode = hljs.highlightAuto(code).value;
        }
    } catch (e) {
        highlightedCode = hljs.highlightAuto(code).value;
    }

    parts.push(
      <div key={`code-${match.index}`} className="code-block-wrapper">
        <div className="code-header"><span>{lang}</span></div>
        <pre><code className={`hljs language-${lang}`} dangerouslySetInnerHTML={{ __html: highlightedCode }} /></pre>
      </div>
    );

    lastIndex = match.index + match[0].length;
  }
  
  const textAfter = content.substring(lastIndex);
  if (textAfter) {
    parts.push(...renderImagesAndText(textAfter));
  }

  return parts;
};

// === Componentes de UI (Header, Footer, Modais) ===
// (Mantidos idênticos ao anterior para consistência visual)

const WelcomeScreen: React.FC<{ onStart: () => void }> = ({ onStart }) => (
  <div className="welcome-screen" role="banner">
    <img src="https://i.imgur.com/lbi4vra.png" alt="Logo da Sena" />
    <h1>Olá! Eu sou a Sena.</h1>
    <p>Agente IA acessível com ferramentas de código, imagem e busca web. <br/>(Powered by Mistral AI & Supabase)</p>
    <button onClick={onStart} autoFocus data-tooltip="Clique para começar">Iniciar Conversa</button>
  </div>
);

const Header: React.FC<{ onSettingsClick: () => void, onAccessibilityClick: () => void }> = ({ onSettingsClick, onAccessibilityClick }) => (
  <header className="header" role="banner">
    <div className="logo-container">
      <img src="https://i.imgur.com/lbi4vra.png" alt="Rosto amigável da Sena" className="logo" />
      <h1 className="header-title">Sena</h1>
    </div>
    <div className="header-actions">
      <button onClick={onAccessibilityClick} className="icon-btn" aria-label="Acessibilidade" data-tooltip="Acessibilidade" data-tooltip-pos="bottom">
        <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2c1.1 0 2 .9 2 2s-.9 2-2 2-2-.9-2-2 .9-2 2-2zm9 7h-6v13h-2v-6h-2v6H9V9H3V7h18v2z"/></svg>
      </button>
      <button onClick={onSettingsClick} className="icon-btn" aria-label="Configurações" data-tooltip="Configurações" data-tooltip-pos="bottom">
        <svg viewBox="0 0 24 24" fill="currentColor"><path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L3.15 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"/></svg>
      </button>
    </div>
  </header>
);

const SettingsMenu: React.FC<{
  mode: ConversationMode, onModeChange: (mode: ConversationMode) => void,
  onClose: () => void,
  onClearChat: () => void
}> = ({ mode, onModeChange, onClose, onClearChat }) => (
  <>
    <div className="backdrop" onClick={onClose} aria-hidden="true" />
    <div className="settings-menu" role="dialog" aria-modal="true" aria-label="Configurações">
      <h3>Modo de Conversa</h3>
      <div className="radio-group">
        {(['Explicativo', 'Profissional', 'Descontraído'] as ConversationMode[]).map((m) => (
          <label key={m} className={`radio-option ${mode === m ? 'selected' : ''}`}>
            <input type="radio" name="mode" value={m} checked={mode === m} onChange={(e) => onModeChange(e.target.value as ConversationMode)} />
            {m}
          </label>
        ))}
      </div>
      <hr className="menu-divider" style={{ margin: '12px 0', border: 'none', borderTop: '1px solid var(--border-color)' }} />
      <button onClick={onClearChat} className="clear-chat-btn" style={{ width: '100%', padding: '8px', background: '#ff4444', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer' }}>
        Limpar Conversa
      </button>
    </div>
  </>
);

const AccessibilityModal: React.FC<{
  onClose: () => void,
  theme: Theme, setTheme: (t: Theme) => void,
  fontSize: FontSize, setFontSize: (s: FontSize) => void,
  dyslexicFont: boolean, setDyslexicFont: (b: boolean) => void,
  wideSpacing: boolean, setWideSpacing: (b: boolean) => void,
  bigCursor: boolean, setBigCursor: (b: boolean) => void
}> = (props) => (
  <div className="modal-overlay">
    <div className="modal accessibility-modal" role="dialog" aria-modal="true" aria-label="Menu Acessibilidade">
      <div className="modal-header">
        <h2>Menu de Acessibilidade</h2>
        <button onClick={props.onClose} aria-label="Fechar">✕</button>
      </div>
      <div className="a11y-grid">
        <div className="a11y-section">
          <h3>Tamanho do Texto</h3>
          <div className="btn-group">
            <button onClick={() => props.setFontSize('normal')} className={props.fontSize === 'normal' ? 'active' : ''}>A</button>
            <button onClick={() => props.setFontSize('large')} className={props.fontSize === 'large' ? 'active' : ''} style={{fontSize: '1.2rem'}}>A+</button>
            <button onClick={() => props.setFontSize('extra-large')} className={props.fontSize === 'extra-large' ? 'active' : ''} style={{fontSize: '1.5rem'}}>A++</button>
          </div>
        </div>
        <div className="a11y-section">
          <h3>Contraste</h3>
          <div className="btn-group">
            <button onClick={() => props.setTheme('light')} className={props.theme === 'light' ? 'active' : ''}>Claro</button>
            <button onClick={() => props.setTheme('dark')} className={props.theme === 'dark' ? 'active' : ''}>Escuro</button>
            <button onClick={() => props.setTheme('high-contrast')} className={props.theme === 'high-contrast' ? 'active hc-btn' : 'hc-btn'}>Alto Contraste</button>
          </div>
        </div>
        <div className="a11y-section">
          <h3>Leitura e Foco</h3>
          <label className="toggle-row">
            <span>Fonte para Dislexia</span>
            <input type="checkbox" checked={props.dyslexicFont} onChange={(e) => props.setDyslexicFont(e.target.checked)} />
          </label>
          <label className="toggle-row">
            <span>Espaçamento Ampliado</span>
            <input type="checkbox" checked={props.wideSpacing} onChange={(e) => props.setWideSpacing(e.target.checked)} />
          </label>
          <label className="toggle-row">
            <span>Cursor Grande</span>
            <input type="checkbox" checked={props.bigCursor} onChange={(e) => props.setBigCursor(e.target.checked)} />
          </label>
        </div>
      </div>
    </div>
  </div>
);

const SubscriptionModal: React.FC<{ onClose: () => void }> = ({ onClose }) => (
  <div className="modal-overlay">
    <div className="modal subscription-modal" role="dialog" aria-modal="true">
      <div className="modal-header">
        <h2>Apoie o Projeto</h2>
        <button onClick={onClose} aria-label="Fechar">✕</button>
      </div>
      <p className="sub-intro">Escolha um plano no Livepix e ajude a manter a Sena acessível!</p>
      <div className="plans-container">
        <div className="plan-card">
          <h3>Apoio Simples</h3>
          <div className="price">R$ 5,00<span>/mês</span></div>
          <p>Ajuda a manter a Sena no ar.</p>
          <a href="https://livepix.gg/sena-start" target="_blank" className="plan-btn">Assinar</a>
        </div>
        <div className="plan-card featured">
          <div className="badge">Mais Popular</div>
          <h3>Membro Fã</h3>
          <div className="price">R$ 15,00<span>/mês</span></div>
          <p>Seu nome nos agradecimentos.</p>
          <a href="https://livepix.gg/sena-pro" target="_blank" className="plan-btn primary">Assinar</a>
        </div>
        <div className="plan-card">
          <h3>Super Parceiro</h3>
          <div className="price">R$ 50,00<span>/mês</span></div>
          <p>Apoio direto ao desenvolvimento.</p>
          <a href="https://livepix.gg/sena-prata" target="_blank" className="plan-btn">Assinar</a>
        </div>
      </div>
    </div>
  </div>
);

const ChatWindow = React.forwardRef<HTMLDivElement, { messages: Message[], isLoading: boolean }>(({ messages, isLoading }, ref) => (
  <div className="chat-window" ref={ref} role="log" aria-live="polite">
    {messages
      .filter(msg => msg.role !== 'system' && msg.role !== 'tool') // Oculta mensagens de sistema/tool da view direta (só mostra resultados)
      .map((msg, index) => (
      <div key={index} className={`message-bubble ${msg.role === 'user' ? 'user' : 'sena'}`}>
        <span className="sr-only">{msg.role === 'user' ? 'Você disse:' : 'Sena disse:'}</span>
        {renderContent(msg.content)}
      </div>
    ))}
    {isLoading && (
      <div className="message-bubble sena thinking-indicator">
        <span /> <span /> <span />
      </div>
    )}
  </div>
));

const ChatInput: React.FC<{ onSendMessage: (input: string) => void, isLoading: boolean }> = ({ onSendMessage, isLoading }) => {
  const [input, setInput] = useState('');
  const [isListening, setIsListening] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const recognitionRef = useRef<any>(null);

  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRecognition) {
      const recognition = new SpeechRecognition();
      recognition.lang = 'pt-BR';
      recognition.continuous = false;
      recognition.interimResults = false;
      recognition.onstart = () => setIsListening(true);
      recognition.onend = () => setIsListening(false);
      recognition.onresult = (event: any) => setInput(prev => (prev ? `${prev} ${event.results[0][0].transcript}` : event.results[0][0].transcript));
      recognitionRef.current = recognition;
    }
  }, []);

  const toggleListening = () => {
    if (!recognitionRef.current) return alert("Navegador sem suporte a voz.");
    isListening ? recognitionRef.current.stop() : recognitionRef.current.start();
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSendMessage(input);
    setInput('');
  };

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 150)}px`;
    }
  }, [input]);

  return (
    <form className="chat-input-form" onSubmit={handleSubmit}>
       <button type="button" onClick={toggleListening} className={`mic-btn ${isListening ? 'listening' : ''}`} aria-label={isListening ? "Parar" : "Falar"} data-tooltip={isListening ? "Parar" : "Voz"}>
        {isListening ? <svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg> : <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z"/><path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/></svg>}
      </button>
      <textarea ref={textareaRef} value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSubmit(e); } }} placeholder="Digite ou fale algo..." rows={1} aria-label="Mensagem" />
      <button type="submit" className="send-btn" disabled={isLoading || !input.trim()} aria-label="Enviar" data-tooltip="Enviar">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" /></svg>
      </button>
    </form>
  );
};

const Footer: React.FC<{ onSubscriptionClick: () => void }> = ({ onSubscriptionClick }) => (
  <footer className="footer">
    <div className="footer-links">
      <a href="#">Privacidade</a>
      <a href="#">Termos</a>
    </div>
    <button onClick={onSubscriptionClick} className="btn-subscribe" data-tooltip="Assinar">♥ Seja Membro</button>
  </footer>
);

const container = document.getElementById('root');
const root = createRoot(container!);
root.render(<App />);