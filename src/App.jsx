import { useEffect, useState } from 'react';
import { supabase } from './supabaseClient';

// --- TELA DE LOGIN E CADASTRO ---
function Login() {
  const [modo, setModo] = useState('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleAuth = async (e) => {
    e.preventDefault();
    setLoading(true);

    if (modo === 'login') {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) alert("Erro no login: " + error.message);
    } else {
      const { error } = await supabase.auth.signUp({ email, password });
      if (error) alert("Erro no cadastro: " + error.message);
      else {
        alert("Conta criada com sucesso! Faça login.");
        setModo('login');
      }
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4 font-sans">
      <div className="bg-white p-8 rounded-2xl shadow-xl w-full max-w-md border border-slate-200">
        <div className="text-center mb-8">
          <h2 className="text-3xl font-black text-slate-900">{modo === 'login' ? 'Bem-vindo!' : 'Crie sua conta'}</h2>
        </div>
        <form onSubmit={handleAuth} className="space-y-4">
          <input type="email" placeholder="E-mail" value={email} onChange={e => setEmail(e.target.value)} className="w-full p-4 bg-slate-50 border rounded-xl outline-none focus:ring-2 focus:ring-indigo-500" required />
          <input type="password" placeholder="Senha" value={password} onChange={e => setPassword(e.target.value)} className="w-full p-4 bg-slate-50 border rounded-xl outline-none focus:ring-2 focus:ring-indigo-500" required />
          <button type="submit" disabled={loading} className="w-full bg-indigo-600 text-white py-4 rounded-xl font-black uppercase disabled:opacity-50 hover:bg-indigo-700 transition-colors">{loading ? '...' : (modo === 'login' ? 'Entrar' : 'Cadastrar')}</button>
        </form>
        <div className="mt-6 text-center text-sm">
          <button onClick={() => setModo(modo === 'login' ? 'cadastro' : 'login')} type="button" className="text-indigo-600 font-bold hover:underline">
            {modo === 'login' ? 'Criar novo Gmail' : 'Voltar para o Login'}
          </button>
        </div>
      </div>
    </div>
  );
}

// --- SISTEMA PRINCIPAL ---
export default function App() {
  const [session, setSession] = useState(null);
  const [userProfile, setUserProfile] = useState(null);
  const [abaAtiva, setAbaAtiva] = useState('estoque');
  
  const [produtos, setProdutos] = useState([]);
  const [usuarios, setUsuarios] = useState([]);
  const [historico, setHistorico] = useState([]);
  
  const [carrinho, setCarrinho] = useState([]);
  
  const [endereco, setEndereco] = useState({
    cep: '', rua: '', numero: '', complemento: '', bairro: '', cidade: '', uf: ''
  });
  
  const [qtdInputs, setQtdInputs] = useState({});

  const [sqlQuery, setSqlQuery] = useState("SELECT * FROM produtos;");
  const [sqlResult, setSqlResult] = useState(null);
  const [sqlError, setSqlError] = useState(null);

  // --- NOVOS ESTADOS PARA EDIÇÃO DE PRODUTOS ---
  const [produtoEditando, setProdutoEditando] = useState(null);
  const [editNome, setEditNome] = useState('');
  const [editPreco, setEditPreco] = useState('');

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session) carregarPerfil(session.user.id);
    });
    supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session) carregarPerfil(session.user.id);
    });
  }, []);

  async function carregarPerfil(uid) {
    const { data } = await supabase.from('perfis').select('*').eq('id', uid).single();
    setUserProfile(data);
    
    if (data?.endereco) {
      try {
        setEndereco(JSON.parse(data.endereco));
      } catch (e) {
        setEndereco(prev => ({ ...prev, rua: data.endereco }));
      }
    }
    buscarDados(data);
  }

  async function buscarDados(perfil = userProfile) {
    if (!perfil) return;
    const { data: p } = await supabase.from('produtos').select('*').order('nome');
    setProdutos(p || []);

    let query = supabase.from('historico').select('*').order('criado_at', { ascending: false });
    if (!perfil.is_admin) query = query.eq('user_id', perfil.id);
    const { data: h } = await query;
    setHistorico(h || []);

    if (perfil.is_admin) {
      const { data: u } = await supabase.from('perfis').select('*').order('email');
      setUsuarios(u || []);
    }
  }

  const handleInputChange = (id, valor) => {
    const somenteNumeros = valor.replace(/\D/g, ''); 
    setQtdInputs({ ...qtdInputs, [id]: somenteNumeros });
  };

  const handleEnderecoChange = (e) => {
    setEndereco({ ...endereco, [e.target.name]: e.target.value });
  };

  function adicionarAoCarrinho(produto) {
    const qtdStr = qtdInputs[produto.id];
    const qtd = parseInt(qtdStr, 10);
    
    if (!qtd || qtd <= 0) return alert("Digite uma quantidade válida!");
    if (qtd > produto.quantidade) return alert("Estoque insuficiente!");

    const itemExistente = carrinho.find(item => item.produto.id === produto.id);
    if (itemExistente) {
      if (itemExistente.qtd + qtd > produto.quantidade) return alert("A soma excede o estoque disponível!");
      setCarrinho(carrinho.map(i => i.produto.id === produto.id ? { ...i, qtd: i.qtd + qtd } : i));
    } else {
      setCarrinho([...carrinho, { produto, qtd }]);
    }
    
    setQtdInputs({ ...qtdInputs, [produto.id]: '' });
    alert("Adicionado ao carrinho!");
  }

  async function finalizarCompra() {
    if (!endereco.rua || !endereco.numero || !endereco.bairro || !endereco.cidade) {
      return alert("Preencha os campos principais do endereço (Rua, Número, Bairro e Cidade)!");
    }
    
    await supabase.from('perfis').update({ endereco: JSON.stringify(endereco) }).eq('id', userProfile.id);

    for (let item of carrinho) {
      const { data: prodDB } = await supabase.from('produtos').select('quantidade').eq('id', item.produto.id).single();
      if (prodDB.quantidade >= item.qtd) {
        await supabase.from('produtos').update({ quantidade: prodDB.quantidade - item.qtd }).eq('id', item.produto.id);
        await supabase.from('historico').insert([{ 
          produto_nome: item.produto.nome, tipo: 'COMPRA', quantidade: item.qtd, 
          user_id: userProfile.id, usuario_email: userProfile.email 
        }]);
      }
    }
    setCarrinho([]);
    alert("Compra finalizada com sucesso!");
    buscarDados();
    setAbaAtiva('historico');
  }

  async function realizarReposicao(produto) {
    const qtd = parseInt(qtdInputs[produto.id], 10);
    if (!qtd || qtd <= 0) return alert("Digite uma quantidade válida!");

    const { error } = await supabase.from('produtos').update({ quantidade: produto.quantidade + qtd, criado_em: new Date().toISOString() }).eq('id', produto.id);
    if (!error) {
      await supabase.from('historico').insert([{ 
        produto_nome: produto.nome, tipo: 'REPOSICAO', quantidade: qtd, 
        user_id: userProfile.id, usuario_email: userProfile.email 
      }]);
      setQtdInputs({ ...qtdInputs, [produto.id]: '' });
      buscarDados();
    }
  }

  async function limparHistorico() {
    if (!window.confirm("ATENÇÃO: Isso vai apagar todo o histórico. Continuar?")) return;
    const { error } = await supabase.from('historico').delete().not('id', 'is', null);
    if (!error) {
      alert("Histórico apagado.");
      buscarDados();
    }
  }

  async function alterarStatusAdmin(idUsuario, statusAtualAdmin) {
    const { error } = await supabase.from('perfis').update({ is_admin: !statusAtualAdmin }).eq('id', idUsuario);
    if (error) {
      alert("Erro ao alterar privilégios: " + error.message);
    } else {
      buscarDados(); 
    }
  }

  function exibirEnderecoNaTabela(endStr) {
    if (!endStr) return <span className="text-slate-400 italic">Não preenchido</span>;
    try {
      const obj = JSON.parse(endStr);
      if (obj.rua) return `${obj.rua}, ${obj.numero} - ${obj.cidade}/${obj.uf}`;
      return endStr; 
    } catch (e) {
      return endStr;
    }
  }

  async function executarConsultaSQL() {
    setSqlError(null);
    setSqlResult(null);
    const { data, error } = await supabase.rpc('executar_sql', { query: sqlQuery });
    if (error) setSqlError(error.message);
    else if (data && data.error) setSqlError(data.error);
    else setSqlResult(data || []);
  }

  // --- NOVAS FUNÇÕES DE EDIÇÃO ---
  const abrirModalEdicao = (produto) => {
    setProdutoEditando(produto);
    setEditNome(produto.nome);
    setEditPreco(produto.preco);
  };

  const salvarEdicaoProduto = async () => {
    if (!editNome || !editPreco) return alert("Preencha todos os campos!");
    
    const precoNumerico = parseFloat(String(editPreco).replace(',', '.'));
    if (isNaN(precoNumerico)) return alert("Preço inválido!");

    const { error } = await supabase.from('produtos')
      .update({ nome: editNome, preco: precoNumerico })
      .eq('id', produtoEditando.id);
      
    if (error) {
      alert("Erro ao atualizar o produto: " + error.message);
    } else {
      alert("Produto atualizado com sucesso!");
      setProdutoEditando(null);
      buscarDados();
    }
  };

  if (!session) return <Login />;
  if (!userProfile) return <div className="text-center p-10 font-bold">Carregando perfil...</div>;

  return (
    <div className="min-h-screen bg-[#f8fafc] text-slate-800 font-sans relative">
      
      {/* HEADER */}
      <header className="bg-white border-b px-8 py-4 flex justify-between items-center sticky top-0 z-10 shadow-sm">
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-black tracking-tight text-slate-900">Estoque <span className="text-indigo-600">Smart</span></h1>
          <span className="text-[10px] font-bold px-2 py-1 bg-slate-100 rounded text-slate-500 uppercase tracking-wider ml-2">
            {userProfile.is_admin ? '🛡️ Admin' : '🛒 Cliente'}
          </span>
        </div>
        <div className="flex gap-4 items-center">
          <span className="text-sm font-semibold text-slate-600">{userProfile.email}</span>
          <button onClick={() => supabase.auth.signOut()} className="text-xs text-red-500 font-bold border border-red-200 px-4 py-2 rounded-lg hover:bg-red-50 transition-colors">Sair</button>
        </div>
      </header>

      <div className="max-w-6xl mx-auto p-8">
        
        {/* NAVEGAÇÃO */}
        <nav className="flex flex-wrap gap-2 mb-8 bg-slate-200 p-1.5 rounded-xl w-fit">
          <button onClick={() => setAbaAtiva('estoque')} className={`px-5 py-2.5 rounded-lg font-bold text-sm transition-all ${abaAtiva === 'estoque' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>Produtos</button>
          
          {!userProfile.is_admin && (
            <button onClick={() => setAbaAtiva('carrinho')} className={`px-5 py-2.5 rounded-lg font-bold text-sm flex gap-2 items-center transition-all ${abaAtiva === 'carrinho' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
              Carrinho {carrinho.length > 0 && <span className="bg-indigo-600 text-white text-[10px] px-2 py-0.5 rounded-full">{carrinho.length}</span>}
            </button>
          )}
          
          <button onClick={() => setAbaAtiva('historico')} className={`px-5 py-2.5 rounded-lg font-bold text-sm transition-all ${abaAtiva === 'historico' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>Histórico</button>
          
          {userProfile.is_admin && (
            <>
              <button onClick={() => setAbaAtiva('usuarios')} className={`px-5 py-2.5 rounded-lg font-bold text-sm transition-all ${abaAtiva === 'usuarios' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>Admins</button>
              <button onClick={() => setAbaAtiva('sql')} className={`px-5 py-2.5 rounded-lg font-bold text-sm transition-all ${abaAtiva === 'sql' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>Terminal SQL</button>
            </>
          )}
        </nav>

        {/* PRODUTOS */}
        {abaAtiva === 'estoque' && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {produtos.map(p => {
              const isEstoqueBaixo = p.quantidade <= 5; 
              
              return (
              <div key={p.id} className={`bg-white p-6 rounded-2xl border-2 flex flex-col shadow-sm hover:shadow-md transition-all ${isEstoqueBaixo ? 'border-red-400' : 'border-emerald-200'}`}>
                
                <div className="flex justify-between items-center mb-4">
                  <span className={`px-2 py-1 text-[10px] font-black uppercase rounded tracking-wide ${isEstoqueBaixo ? 'bg-red-500 text-white' : 'bg-emerald-100 text-emerald-700'}`}>
                    {isEstoqueBaixo ? 'Estoque Baixo' : 'Estoque OK'}
                  </span>
                  <span className="text-[10px] font-bold text-slate-400 uppercase">
                    Qtd: {p.quantidade}
                  </span>
                </div>

                <div className="flex-grow">
                  {/* ALTERADO AQUI: Nome do produto e botão de Editar juntos */}
                  <div className="flex justify-between items-start mb-3">
                    <h2 className="text-xl font-bold text-slate-800">{p.nome}</h2>
                    {userProfile.is_admin && (
                      <button 
                        onClick={() => abrirModalEdicao(p)}
                      >
                        ✏️
                      </button>
                    )}
                  </div>
                  
                  <div className="bg-slate-50 py-4 px-4 rounded-xl mb-4 border border-slate-100 flex items-center justify-center">
                     <p className="text-3xl font-black text-slate-900">R$ {Number(p.preco).toFixed(2)}</p>
                  </div>
                  <p className="text-sm font-semibold text-slate-500 mb-6 text-center">
                    Em estoque: <span className={isEstoqueBaixo ? "text-red-500 font-black" : "text-emerald-600 font-bold"}>{p.quantidade} un.</span>
                  </p>
                </div>
                
                <div className="flex flex-col gap-2 mt-auto">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Quantidade para ação:</label>
                  <div className="flex gap-3">
                    <input 
                      type="text" 
                      value={qtdInputs[p.id] || ''} 
                      onChange={(e) => handleInputChange(p.id, e.target.value)}
                      placeholder="1" 
                      className="w-20 p-3 border border-slate-200 rounded-xl text-center font-black text-slate-700 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500 transition-all" 
                    />
                    {!userProfile.is_admin ? (
                      <button onClick={() => adicionarAoCarrinho(p)} className="flex-1 bg-indigo-600 text-white font-black uppercase tracking-widest rounded-xl hover:bg-indigo-700 transition-colors shadow-sm">
                        Comprar
                      </button>
                    ) : (
                      <button onClick={() => realizarReposicao(p)} className="flex-1 bg-emerald-100 text-emerald-700 font-black uppercase tracking-widest rounded-xl border border-emerald-200 hover:bg-emerald-200 transition-colors">
                        Repor
                      </button>
                    )}
                  </div>
                </div>

              </div>
            )})}
          </div>
        )}

        {/* CARRINHO */}
        {abaAtiva === 'carrinho' && !userProfile.is_admin && (
          <div className="bg-white p-8 rounded-2xl border border-slate-200 shadow-sm max-w-2xl">
            <h2 className="text-2xl font-black mb-6">Seu Carrinho</h2>
            {carrinho.length === 0 ? <p className="text-slate-500 font-medium">O carrinho está vazio.</p> : (
              <div className="space-y-6">
                <ul className="divide-y divide-slate-100 border-b border-slate-100 pb-4">
                  {carrinho.map((item, idx) => (
                    <li key={idx} className="py-4 flex justify-between font-bold text-slate-700">
                      <span>{item.qtd}x {item.produto.nome}</span>
                      <span>R$ {(item.produto.preco * item.qtd).toFixed(2)}</span>
                    </li>
                  ))}
                </ul>
                
                <div className="bg-slate-50 p-6 rounded-xl border border-slate-100">
                  <h3 className="block text-sm font-bold text-slate-700 mb-4">Endereço de Entrega (Salvo automaticamente):</h3>
                  
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <div className="md:col-span-1">
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider ml-1">CEP</label>
                      <input name="cep" value={endereco.cep} onChange={handleEnderecoChange} placeholder="00000-000" className="w-full mt-1 p-3 border border-slate-200 rounded-xl outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 text-sm" />
                    </div>
                    <div className="md:col-span-3">
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider ml-1">Rua / Avenida</label>
                      <input name="rua" value={endereco.rua} onChange={handleEnderecoChange} placeholder="Ex: Rua das Flores" className="w-full mt-1 p-3 border border-slate-200 rounded-xl outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 text-sm" />
                    </div>
                    <div className="md:col-span-1">
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider ml-1">Número</label>
                      <input name="numero" value={endereco.numero} onChange={handleEnderecoChange} placeholder="Ex: 123" className="w-full mt-1 p-3 border border-slate-200 rounded-xl outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 text-sm" />
                    </div>
                    <div className="md:col-span-1">
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider ml-1">Complemento</label>
                      <input name="complemento" value={endereco.complemento} onChange={handleEnderecoChange} placeholder="Apto 12" className="w-full mt-1 p-3 border border-slate-200 rounded-xl outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 text-sm" />
                    </div>
                    <div className="md:col-span-2">
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider ml-1">Bairro</label>
                      <input name="bairro" value={endereco.bairro} onChange={handleEnderecoChange} placeholder="Centro" className="w-full mt-1 p-3 border border-slate-200 rounded-xl outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 text-sm" />
                    </div>
                    <div className="md:col-span-3">
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider ml-1">Cidade</label>
                      <input name="cidade" value={endereco.cidade} onChange={handleEnderecoChange} placeholder="São Paulo" className="w-full mt-1 p-3 border border-slate-200 rounded-xl outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 text-sm" />
                    </div>
                    <div className="md:col-span-1">
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider ml-1">UF</label>
                      <input name="uf" value={endereco.uf} onChange={handleEnderecoChange} placeholder="SP" maxLength="2" className="w-full mt-1 p-3 border border-slate-200 rounded-xl outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 text-sm uppercase" />
                    </div>
                  </div>
                </div>

                <button onClick={finalizarCompra} className="w-full bg-emerald-500 text-white py-4 rounded-xl font-black text-lg shadow-md hover:bg-emerald-600 transition-colors">Finalizar Compra</button>
              </div>
            )}
          </div>
        )}

        {/* HISTÓRICO */}
        {abaAtiva === 'historico' && (
          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
            <div className="p-5 bg-slate-50 flex justify-between items-center border-b border-slate-200">
              <h2 className="font-black text-slate-800 text-lg">Relatório de Transações</h2>
              {userProfile.is_admin && (
                <button onClick={limparHistorico} className="bg-white text-red-500 px-4 py-2 rounded-lg font-bold text-xs border border-red-200 hover:bg-red-50 transition-colors shadow-sm">Limpar Histórico</button>
              )}
            </div>
            <table className="w-full text-left text-sm">
              <thead className="bg-white border-b border-slate-100">
                <tr>
                  <th className="p-4 font-bold text-slate-400">Produto</th>
                  <th className="p-4 font-bold text-slate-400">Tipo</th>
                  <th className="p-4 font-bold text-slate-400">Qtd</th>
                  <th className="p-4 font-bold text-slate-400">Usuário</th>
                  <th className="p-4 font-bold text-slate-400">Data</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {historico.length === 0 ? <tr><td colSpan="5" className="p-8 text-center text-slate-400 font-medium">Nenhum registro encontrado.</td></tr> : null}
                {historico.map(h => (
                  <tr key={h.id} className="hover:bg-slate-50 transition-colors">
                    <td className="p-4 font-bold text-slate-700">{h.produto_nome}</td>
                    <td className="p-4">
                      <span className={`px-2.5 py-1 rounded-md text-[10px] font-black tracking-wide ${h.tipo === 'COMPRA' ? 'bg-orange-100 text-orange-600' : 'bg-emerald-100 text-emerald-600'}`}>{h.tipo}</span>
                    </td>
                    <td className="p-4 font-mono font-semibold text-slate-600">{h.quantidade}</td>
                    <td className="p-4 font-medium text-slate-500">{h.usuario_email || 'Desconhecido'}</td>
                    <td className="p-4 text-slate-400 text-xs font-medium">{new Date(h.criado_at).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* GERENCIAMENTO DE USUÁRIOS (ADMINS) */}
        {abaAtiva === 'usuarios' && userProfile.is_admin && (
          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
            <div className="p-5 bg-slate-50 flex justify-between items-center border-b border-slate-200">
              <h2 className="font-black text-slate-800 text-lg">Gerenciamento de Usuários</h2>
              <span className="text-xs text-slate-500 font-medium">Total: {usuarios.length} usuários</span>
            </div>
            
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm min-w-[600px]">
                <thead className="bg-white border-b border-slate-100">
                  <tr>
                    <th className="p-4 font-bold text-slate-400">E-mail</th>
                    <th className="p-4 font-bold text-slate-400">Endereço Principal</th>
                    <th className="p-4 font-bold text-slate-400">Permissão</th>
                    <th className="p-4 font-bold text-slate-400 text-right">Ação</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {usuarios.map(u => (
                    <tr key={u.id} className="hover:bg-slate-50 transition-colors">
                      <td className="p-4 font-bold text-slate-700">{u.email}</td>
                      <td className="p-4 text-slate-500 max-w-xs truncate">
                        {exibirEnderecoNaTabela(u.endereco)}
                      </td>
                      <td className="p-4">
                        <span className={`px-2.5 py-1 rounded-md text-[10px] font-black tracking-wide ${u.is_admin ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-100 text-slate-500'}`}>
                          {u.is_admin ? '🛡️ ADMIN' : '🛒 CLIENTE'}
                        </span>
                      </td>
                      <td className="p-4 text-right">
                        <button 
                          onClick={() => alterarStatusAdmin(u.id, u.is_admin)}
                          disabled={u.id === userProfile.id}
                          className={`px-3 py-1.5 rounded-lg font-bold text-xs border transition-colors ${
                            u.id === userProfile.id 
                            ? 'opacity-30 cursor-not-allowed border-slate-200 text-slate-400' 
                            : (u.is_admin 
                                ? 'border-red-200 text-red-500 hover:bg-red-50' 
                                : 'border-indigo-200 text-indigo-600 hover:bg-indigo-50')
                          }`}
                        >
                          {u.id === userProfile.id ? 'Você' : (u.is_admin ? 'Remover Admin' : 'Tornar Admin')}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TERMINAL SQL */}
        {abaAtiva === 'sql' && userProfile.is_admin && (
          <div className="bg-[#0f172a] rounded-2xl shadow-xl border border-slate-800 flex flex-col min-h-[500px] overflow-hidden">
            <div className="p-4 border-b border-slate-800 flex gap-4 items-center bg-slate-900">
              <textarea 
                value={sqlQuery} 
                onChange={(e) => setSqlQuery(e.target.value)} 
                className="w-full h-16 bg-[#1e293b] text-emerald-400 p-3 rounded-lg outline-none font-mono text-sm resize-none focus:ring-1 focus:ring-emerald-500/50 transition-all border border-slate-700" 
                spellCheck="false"
              />
              <button onClick={executarConsultaSQL} className="bg-indigo-600 text-white px-6 py-4 rounded-lg font-bold text-sm uppercase hover:bg-indigo-500 transition-colors whitespace-nowrap shadow-lg">Executar</button>
            </div>

            <div className="flex-grow p-0 bg-[#0f172a] overflow-auto">
              {sqlError && <div className="p-6 text-red-400 font-mono text-sm"><span className="font-bold">ERRO SQL: </span> {sqlError}</div>}
              
              {!sqlError && sqlResult && sqlResult.length > 0 && (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-sm font-mono">
                    <thead className="bg-[#1e293b] sticky top-0 shadow-sm">
                      <tr>
                        {Object.keys(sqlResult[0]).map((chave) => (
                          <th key={chave} className="p-3 border-b border-r border-slate-700 text-indigo-400 uppercase text-xs font-bold tracking-wider">{chave}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {sqlResult.map((linha, index) => (
                        <tr key={index} className="hover:bg-[#1e293b] transition-colors">
                          {Object.values(linha).map((valor, i) => (
                            <td key={i} className="p-3 border-b border-r border-slate-800 text-slate-300 whitespace-nowrap">{String(valor)}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              
              {!sqlError && sqlResult && sqlResult.length === 0 && (
                <div className="p-6 text-slate-500 font-mono text-sm">Comando executado com sucesso. (0 linhas retornadas)</div>
              )}
            </div>
          </div>
        )}

      </div>

      {/* --- MODAL DE EDIÇÃO DE PRODUTO --- */}
      {produtoEditando && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-xl border border-slate-200">
            <h3 className="text-xl font-black mb-6 text-slate-800">Editar Produto</h3>
            
            <div className="space-y-4">
              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider ml-1">Nome do Produto</label>
                <input 
                  type="text" 
                  value={editNome} 
                  onChange={e => setEditNome(e.target.value)} 
                  className="w-full mt-1 p-3 border border-slate-200 rounded-xl outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 text-sm font-semibold text-slate-700" 
                />
              </div>
              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider ml-1">Preço (R$)</label>
                <input 
                  type="number" 
                  step="0.01"
                  value={editPreco} 
                  onChange={e => setEditPreco(e.target.value)} 
                  className="w-full mt-1 p-3 border border-slate-200 rounded-xl outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 text-sm font-semibold text-slate-700" 
                />
              </div>
            </div>

            <div className="flex gap-3 mt-8">
              <button 
                onClick={() => setProdutoEditando(null)} 
                className="flex-1 bg-slate-100 text-slate-600 font-black uppercase tracking-widest rounded-xl py-3 hover:bg-slate-200 transition-colors text-[10px]"
              >
                Cancelar
              </button>
              <button 
                onClick={salvarEdicaoProduto} 
                className="flex-1 bg-indigo-600 text-white font-black uppercase tracking-widest rounded-xl py-3 hover:bg-indigo-700 transition-colors text-[10px] shadow-sm"
              >
                Salvar Alterações
              </button>
            </div>
          </div>
        </div>
      )}
      
    </div>
  );
}