import React, { useState, useEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';

// === Tipos e Interfaces ===
interface Message {
  role: 'user' | 'assistant';
  content: string;
}

type ConversationMode = 'Explicativo' | 'Profissional' | 'Descontraído';
type FontSize = 'normal' | 'large';
type Theme = 'light' | 'dark';

// === Mapa de Prompts de Sistema ===
const systemPrompts: Record<ConversationMode, string> = {
  Explicativo: `Você é Sena, uma assistente de IA desenvolvida pela AmplaAI e incubada pela Orpheo Studio. Sua personalidade é amável, calma e extremamente paciente. Seu objetivo é ajudar usuários, especialmente idosos (60+) e leigos em tecnologia. Use um tom acolhedor e jovial, mas sempre profissional. Explique conceitos complexos de forma simples e passo a passo. Adapte seu vocabulário para ser o mais claro e acessível possível.`,
  Profissional: `Você é Sena, uma assistente de IA da AmplaAI. Seu modo de operação é profissional. Forneça respostas diretas, técnicas e precisas. Mantenha um tom formal e focado nos fatos.`,
  Descontraído: `Você é Sena, uma IA da AmplaAI. Você é amigável e gosta de conversar. Use um tom leve, informal e um pouco divertido. Sinta-se à vontade para usar emojis quando apropriado para tornar a conversa mais agradável.`,
};

// === Componente Principal da Aplicação ===
const App: React.FC = () => {
  // === Estados ===
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [showWelcome, setShowWelcome] = useState<boolean>(true);
  
  // Estados de Configuração com carregamento do localStorage
  const [theme, setTheme] = useState<Theme>(() => (localStorage.getItem('sena-theme') as Theme) || 'light');
  const [conversationMode, setConversationMode] = useState<ConversationMode>(() => (localStorage.getItem('sena-mode') as ConversationMode) || 'Explicativo');
  const [fontSize, setFontSize] = useState<FontSize>(() => (localStorage.getItem('sena-fontsize') as FontSize) || 'normal');
  const [isMenuOpen, setIsMenuOpen] = useState<boolean>(false);
  
  const chatWindowRef = useRef<HTMLDivElement>(null);

  // === Efeitos ===
  // Aplica o tema e salva no localStorage
  useEffect(() => {
    document.body.className = `${theme}-mode`;
    localStorage.setItem('sena-theme', theme);
  }, [theme]);

  // Salva o modo de conversa no localStorage
  useEffect(() => {
    localStorage.setItem('sena-mode', conversationMode);
  }, [conversationMode]);

  // Salva o tamanho da fonte no localStorage
  useEffect(() => {
    localStorage.setItem('sena-fontsize', fontSize);
  }, [fontSize]);

  // Rola para o final do chat a cada nova mensagem
  useEffect(() => {
    if (chatWindowRef.current) {
      chatWindowRef.current.scrollTop = chatWindowRef.current.scrollHeight;
    }
  }, [messages, isLoading]);

  // === Funções ===
  const handleSendMessage = async (userInput: string) => {
    if (!userInput.trim() || isLoading) return;

    const newUserMessage: Message = { role: 'user', content: userInput };
    setMessages(prev => [...prev, newUserMessage]);
    setIsLoading(true);

    // Constrói o histórico para a API
    const apiMessages = [
      { role: 'system', content: systemPrompts[conversationMode] },
      ...messages,
      newUserMessage
    ].map(({ role, content }) => ({ role, content }));

    try {
      // O endpoint foi alterado para o da API oficial da Mistral para corrigir o erro "Failed to fetch" (CORS).
      const response = await fetch('https://api.mistral.ai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.API_KEY}`,
        },
        body: JSON.stringify({
          // O modelo foi alterado para um padrão da Mistral. Substitua pelo seu modelo customizado se necessário.
          model: 'open-mistral-7b', 
          messages: apiMessages,
        }),
      });

      if (!response.ok) {
        throw new Error(`Erro na API: ${response.statusText}`);
      }

      const data = await response.json();
      const senaResponse = data.choices[0]?.message?.content;
      
      if (senaResponse) {
        setMessages(prev => [...prev, { role: 'assistant', content: senaResponse }]);
      } else {
        throw new Error("Resposta da API vazia ou em formato inesperado.");
      }

    } catch (error) {
      console.error("Falha ao comunicar com a API da Sena:", error);
      const errorMessage: Message = {
        role: 'assistant',
        content: 'Desculpe, estou com um problema para me conectar. Por favor, tente novamente mais tarde.'
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };
  
  const toggleTheme = () => {
    setTheme(prev => (prev === 'light' ? 'dark' : 'light'));
  };

  const handleReportProblem = () => {
    // Integração com Clarity para relatar evento customizado
    if (window.clarity) {
      window.clarity('event', 'problem_reported');
      alert('Seu relatório de problema foi enviado. Obrigado por ajudar a melhorar a Sena!');
    } else {
      alert('Não foi possível enviar o relatório. Ferramenta de análise não encontrada.');
    }
    setIsMenuOpen(false);
  };

  if (showWelcome) {
    return <WelcomeScreen onStart={() => setShowWelcome(false)} />;
  }

  return (
    <div className={`app-container ${fontSize === 'large' ? 'font-size-large' : ''}`}>
      <Header onLogoClick={() => setIsMenuOpen(prev => !prev)} />
      {isMenuOpen && (
        <SettingsMenu
          mode={conversationMode}
          onModeChange={setConversationMode}
          fontSize={fontSize}
          onFontSizeChange={setFontSize}
          onReportProblem={handleReportProblem}
          theme={theme}
          onToggleTheme={toggleTheme}
        />
      )}
      
      <main className="main-content">
        <ChatWindow ref={chatWindowRef} messages={messages} isLoading={isLoading} />
        <ChatInput onSendMessage={handleSendMessage} isLoading={isLoading} />
      </main>
      
      <Footer />
      <BuyMeACoffeeButton />
    </div>
  );
};

// === Componentes Filhos ===

const WelcomeScreen: React.FC<{ onStart: () => void }> = ({ onStart }) => (
  <div className="welcome-screen">
    <img src="https://i.imgur.com/lbi4vra.png" alt="Logo da Sena" />
    <h1>Bem-vindo(a) à Sena</h1>
    <p>Sua assistente de IA amigável, projetada para ser simples e acessível. Estou aqui para ajudar com suas dúvidas, explicar tecnologias e conversar.</p>
    <button onClick={onStart}>Iniciar Conversa</button>
  </div>
);

const Header: React.FC<{ onLogoClick: () => void }> = ({ onLogoClick }) => (
  <header className="header">
    <div className="logo-container" onClick={onLogoClick} aria-label="Abrir menu de configurações" role="button" tabIndex={0}>
      <img src="https://i.imgur.com/lbi4vra.png" alt="Logo da Sena" className="logo" />
      <h1 className="header-title">Sena</h1>
    </div>
  </header>
);

const SettingsMenu: React.FC<{
  mode: ConversationMode, onModeChange: (mode: ConversationMode) => void,
  fontSize: FontSize, onFontSizeChange: (size: FontSize) => void,
  onReportProblem: () => void,
  theme: Theme, onToggleTheme: () => void
}> = (props) => (
  <div className="settings-menu">
    <h3>Configurações</h3>
    <div className="settings-group">
      <label htmlFor="convo-mode">Modo de Conversa</label>
      <select id="convo-mode" value={props.mode} onChange={(e) => props.onModeChange(e.target.value as ConversationMode)}>
        <option value="Explicativo">Explicativo</option>
        <option value="Profissional">Profissional</option>
        <option value="Descontraído">Descontraído</option>
      </select>
    </div>
    <div className="settings-group">
      <label htmlFor="font-size">Tamanho da Fonte</label>
      <select id="font-size" value={props.fontSize} onChange={(e) => props.onFontSizeChange(e.target.value as FontSize)}>
        <option value="normal">Normal</option>
        <option value="large">Grande</option>
      </select>
    </div>
    <div className="settings-group">
      <label>Ajuda</label>
      <button onClick={props.onReportProblem}>Relatar um Problema</button>
    </div>
    <div className="theme-toggle-container">
      <span>Modo {props.theme === 'light' ? 'Claro' : 'Escuro'}</span>
      <button onClick={props.onToggleTheme}>
        {props.theme === 'light' ? '🌙' : '☀️'}
      </button>
    </div>
  </div>
);

const ChatWindow = React.forwardRef<HTMLDivElement, { messages: Message[], isLoading: boolean }>(({ messages, isLoading }, ref) => (
  <div className="chat-window" ref={ref}>
    {messages.map((msg, index) => (
      <div key={index} className={`message-bubble ${msg.role === 'user' ? 'user' : 'sena'}`}>
        {msg.content}
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
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSendMessage(input);
    setInput('');
  };

  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      textarea.style.height = `${textarea.scrollHeight}px`;
    }
  }, [input]);

  return (
    <form className="chat-input-form" onSubmit={handleSubmit}>
      <textarea
        ref={textareaRef}
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSubmit(e);
          }
        }}
        placeholder="Digite sua mensagem..."
        rows={1}
        aria-label="Caixa de texto para mensagem"
      />
      <button type="submit" disabled={isLoading || !input.trim()} aria-label="Enviar mensagem">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
          <path d="M3.478 2.405a.75.75 0 00-.926.94l2.432 7.905H13.5a.75.75 0 010 1.5H4.984l-2.432 7.905a.75.75 0 00.926.94 60.519 60.519 0 0018.445-8.986.75.75 0 000-1.218A60.517 60.517 0 003.478 2.405z" />
        </svg>
      </button>
    </form>
  );
};

const Footer: React.FC = () => (
  <footer className="footer">
    <a href="https://politicas.orpheostudio.com.br" target="_blank" rel="noopener noreferrer">Políticas de Privacidade</a>
    <a href="https://termos.orpheostudio.com.br" target="_blank" rel="noopener noreferrer">Termos de Uso</a>
    <a href="https://orpheostudio.com.br" target="_blank" rel="noopener noreferrer">Sobre a AmplaAI</a>
  </footer>
);

const BuyMeACoffeeButton: React.FC = () => (
  // Link atualizado. Substitua 'orpheostudio' pelo seu usuário do Buy Me a Coffee.
  <a href="https://www.buymeacoffee.com/orpheostudio" target="_blank" rel="noopener noreferrer" className="bmac-button">
    <span>☕</span> Buy Me a Coffee
  </a>
);

// === Renderização da Aplicação ===
const container = document.getElementById('root');
const root = createRoot(container!);
root.render(<App />);

// Adicionar a interface `clarity` ao objeto `window` para TypeScript
declare global {
  interface Window {
    clarity: (action: string, key: string, value?: string) => void;
  }
}