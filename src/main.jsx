import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { version as appVersion } from '../package.json';
import { createClient } from '@supabase/supabase-js';
import { Activity, ArrowDownRight, ArrowUpRight, Bath, BedDouble, CalendarDays, Check, ChevronDown, CircleAlert, CircleDollarSign, FileText, Home, KeyRound, LogOut, Menu, Pencil, Plus, Search, Settings2, Trash2, Users, Wallet, X } from 'lucide-react';
import './styles.css';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const supabase = supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null;
const brl = value => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value) || 0);
const today = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const monthNow = today.slice(0, 7);
const money = value => Number(value || 0);

function calcLate(rent, dueDate, payDate) {
  if (!rent || !dueDate || !payDate || payDate <= dueDate) return { days: 0, fine: 0, interest: 0, total: money(rent) };
  const days = Math.floor((new Date(`${payDate}T12:00:00`) - new Date(`${dueDate}T12:00:00`)) / 86400000);
  const fine = money(rent) * 0.10;
  const interest = money(rent) * 0.01 * days / 30;
  return { days, fine, interest, total: money(rent) + fine + interest };
}
function monthName(value) { return new Date(`${value}-02T12:00:00`).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }); }
function dateBR(value) { return value ? new Date(`${value}T12:00:00`).toLocaleDateString('pt-BR') : '—'; }
function monthsThrough(startMonth, endMonth = monthNow) {
  if (!startMonth || startMonth > endMonth) return [];
  const [startYear, startNumber] = startMonth.split('-').map(Number);
  const [endYear, endNumber] = endMonth.split('-').map(Number);
  const months = [];
  for (let year = startYear, month = startNumber; year < endYear || (year === endYear && month <= endNumber);) {
    months.push(`${year}-${String(month).padStart(2, '0')}`);
    if (++month > 12) { year++; month = 1; }
  }
  return months;
}
function unitHistory(unit, bills, payments, residents) {
  if (!unit) return [];
  const unitPayments = payments.filter(payment => payment.unit_id === unit.id && payment.month <= monthNow);
  const startMonth = [unit.contract_start?.slice(0, 7), unit.created_at?.slice(0, 7), ...unitPayments.map(payment => payment.month)]
    .filter(Boolean).sort()[0] || monthNow;
  return monthsThrough(startMonth).map(month => {
    const bill = bills.find(item => item.month === month);
    const payment = unitPayments.find(item => item.month === month);
    const dueDate = `${month}-${String(unit.due_day).padStart(2, '0')}`;
    const late = calcLate(unit.rent_amount, dueDate, today);
    const water = residents ? money(bill?.water_total) / residents * Number(unit.residents) : 0;
    const electricity = residents ? money(bill?.electricity_total) / residents * Number(unit.residents) : 0;
    const paid = payment?.status === 'pago';
    return {
      month, dueDate, payment, paid, water, electricity,
      total: paid ? money(payment.amount) : late.total + water + electricity,
      lateDays: paid ? 0 : late.days,
      overdue: !paid && today > dueDate,
    };
  }).reverse();
}

function App() {
  const [session, setSession] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authMode, setAuthMode] = useState('login');
  const [authAction, setAuthAction] = useState(() => new URLSearchParams(window.location.hash.slice(1)).get('type'));
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [authError, setAuthError] = useState('');
  const [units, setUnits] = useState([]);
  const [bills, setBills] = useState([]);
  const [payments, setPayments] = useState([]);
  const [profile, setProfile] = useState(null);
  const [profiles, setProfiles] = useState([]);
  const [profileLoading, setProfileLoading] = useState(false);
  const [tenantResidentCount, setTenantResidentCount] = useState(0);
  const [tab, setTab] = useState('Visão geral');
  const [search, setSearch] = useState('');
  const [showUnit, setShowUnit] = useState(false);
  const [showBill, setShowBill] = useState(false);
  const [showTenant, setShowTenant] = useState(false);
  const [editingUnit, setEditingUnit] = useState(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [payDate, setPayDate] = useState(today);
  const [selectedMonth, setSelectedMonth] = useState(monthNow);
  const [mobileNav, setMobileNav] = useState(false);

  useEffect(() => {
    if (!supabase) { setAuthLoading(false); return; }
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setAuthLoading(false); });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, next) => setSession(next));
    return () => subscription.unsubscribe();
  }, []);
  useEffect(() => { if (session) loadProfile(); else { setProfile(null); setUnits([]); setBills([]); setPayments([]); } }, [session]);

  async function loadProfile() {
    setProfileLoading(true); setNotice('');
    const { data, error } = await supabase.from('user_profiles').select('*').eq('user_id', session.user.id).maybeSingle();
    if (error) setNotice(`Não foi possível verificar seu perfil: ${error.message}`);
    setProfile(data || null);
    if (data?.role === 'admin') await loadData();
    if (data?.role === 'tenant') await loadTenantData(data);
    setProfileLoading(false);
  }
  async function loadData() {
    const [u, b, p, users] = await Promise.all([
      supabase.from('units').select('*').order('unit_name'),
      supabase.from('utility_periods').select('*').order('month', { ascending: false }),
      supabase.from('rent_payments').select('*').order('month', { ascending: false }),
      supabase.from('user_profiles').select('*').eq('role', 'tenant').order('email')
    ]);
    const error = u.error || b.error || p.error || users.error;
    if (error) setNotice(`Não foi possível carregar os dados: ${error.message}`);
    setUnits(u.data || []); setBills(b.data || []); setPayments(p.data || []); setProfiles(users.data || []);
  }
  async function loadTenantData(tenantProfile) {
    const [u, b, p, residents] = await Promise.all([
      supabase.from('units').select('*').eq('id', tenantProfile.unit_id).maybeSingle(),
      supabase.from('utility_periods').select('*').order('month', { ascending: false }),
      supabase.from('rent_payments').select('*').eq('unit_id', tenantProfile.unit_id).order('month', { ascending: false }),
      supabase.rpc('current_property_resident_count')
    ]);
    const error = u.error || b.error || p.error || residents.error;
    if (error) setNotice(`Não foi possível carregar suas informações: ${error.message}`);
    setUnits(u.data ? [u.data] : []); setBills(b.data || []); setPayments(p.data || []); setTenantResidentCount(residents.data || 0);
  }
  async function inviteTenant(event) {
    event.preventDefault(); setBusy(true); setNotice('');
    const form = new FormData(event.currentTarget);
    const { data, error } = await supabase.functions.invoke('create-tenant-user', { body: { email: form.get('email'), unit_id: form.get('unit_id') } });
    let detail = data?.error || data?.message;
    if (!detail && error?.context && typeof error.context.clone === 'function') {
      const payload = await error.context.clone().json().catch(() => null);
      detail = payload?.error || payload?.message;
    }
    if (error || data?.error) setNotice(`Não foi possível enviar o convite: ${detail || error.message}`);
    else { setShowTenant(false); setNotice(data.message || 'Convite enviado ao inquilino.'); await loadData(); }
    setBusy(false);
  }
  async function manageTenant(person, action) {
    if (action === 'delete' && !window.confirm(`Remover o acesso de ${person.email}? A unidade e o histórico financeiro serão mantidos.`)) return;
    setBusy(true); setNotice('');
    const { data, error } = await supabase.functions.invoke('manage-tenant-user', { body: { user_id: person.user_id, action } });
    if (error || data?.error) setNotice(`Não foi possível concluir a ação: ${data?.error || error.message}`);
    else {
      setNotice(data.message || 'Ação concluída.');
      if (action === 'delete') await loadData();
    }
    setBusy(false);
  }
  function editTenant(person) {
    const unit = units.find(item => item.id === person.unit_id);
    if (!unit) { setNotice('A unidade vinculada não foi encontrada.'); return; }
    setEditingUnit(unit);
    setShowUnit(true);
  }
  async function authenticate(event) {
    event.preventDefault(); setAuthError(''); setBusy(true);
    const result = await supabase.auth.signInWithPassword({ email, password });
    if (result.error) setAuthError(result.error.message);
    setBusy(false);
  }
  async function setTenantPassword(event) {
    event.preventDefault(); setAuthError('');
    if (newPassword !== confirmNewPassword) {
      setAuthError('As senhas não coincidem.');
      return;
    }
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) setAuthError(error.message);
    else {
      setAuthAction(null);
      setNewPassword('');
      setConfirmNewPassword('');
      window.history.replaceState(null, document.title, `${window.location.pathname}${window.location.search}`);
    }
    setBusy(false);
  }
  async function saveUnit(event) {
    event.preventDefault(); setBusy(true); setNotice('');
    const form = new FormData(event.currentTarget);
    const row = {
      unit_name: form.get('unit_name').trim(), tenant_name: form.get('tenant_name').trim(), phone: form.get('phone').trim(),
      residents: Number(form.get('residents')), rent_amount: Number(form.get('rent_amount')), due_day: Number(form.get('due_day')),
      contract_number: form.get('contract_number').trim(), contract_start: form.get('contract_start') || null,
      contract_end: form.get('contract_end') || null, contract_url: form.get('contract_url').trim() || null,
      status: form.get('status'), owner_id: session.user.id
    };
    const query = editingUnit ? supabase.from('units').update(row).eq('id', editingUnit.id) : supabase.from('units').insert(row);
    const { error } = await query;
    if (error) setNotice(`Erro ao salvar unidade: ${error.message}`);
    else { setShowUnit(false); setEditingUnit(null); setNotice('Unidade salva com sucesso.'); await loadData(); }
    setBusy(false);
  }
  async function saveBill(event) {
    event.preventDefault(); setBusy(true); setNotice('');
    const form = new FormData(event.currentTarget);
    const row = { month: form.get('month'), water_total: Number(form.get('water_total') || 0), electricity_total: Number(form.get('electricity_total') || 0), owner_id: session.user.id };
    const { error } = await supabase.from('utility_periods').upsert(row, { onConflict: 'owner_id,month' });
    if (error) setNotice(`Erro ao salvar rateio: ${error.message}`);
    else { setShowBill(false); setNotice('Contas do mês salvas. O rateio foi recalculado.'); await loadData(); }
    setBusy(false);
  }
  async function registerPayment(unit, month, amount, paymentDate) {
    if (!window.confirm(`Confirmar recebimento de ${brl(amount)} da unidade ${unit.unit_name} em ${dateBR(paymentDate)}?`)) return;
    const { error } = await supabase.from('rent_payments').upsert({ owner_id: session.user.id, unit_id: unit.id, month, paid_at: paymentDate, amount, status: 'pago' }, { onConflict: 'unit_id,month' });
    setNotice(error ? `Não foi possível registrar pagamento: ${error.message}` : 'Pagamento registrado.');
    if (!error) loadData();
  }
  async function deleteUnit(unit) {
    if (!window.confirm(`Excluir a unidade ${unit.unit_name}?`)) return;
    const { error } = await supabase.from('units').delete().eq('id', unit.id);
    setNotice(error ? `Erro ao excluir: ${error.message}` : 'Unidade excluída.'); if (!error) loadData();
  }

  const currentBill = bills.find(b => b.month === selectedMonth);
  const totalResidents = profile?.role === 'tenant' ? tenantResidentCount : units.filter(u => u.status === 'ativa').reduce((sum, u) => sum + Number(u.residents), 0);
  const activeUnits = units.filter(u => u.status === 'ativa');
  const utilityTotal = money(currentBill?.water_total) + money(currentBill?.electricity_total);
  const totalRent = activeUnits.reduce((sum, u) => sum + money(u.rent_amount), 0);
  const expectedTotal = totalRent + utilityTotal;
  const paidPayments = payments.filter(p => p.month === selectedMonth && p.status === 'pago');
  const paidUnitIds = new Set(paidPayments.map(p => p.unit_id));
  const paidTotal = paidPayments.reduce((sum, payment) => sum + money(payment.amount), 0);
  const dueUnits = activeUnits.filter(u => !paidUnitIds.has(u.id));
  const filteredUnits = units.filter(u => `${u.unit_name} ${u.tenant_name}`.toLowerCase().includes(search.toLowerCase()));
  const lateEstimate = useMemo(() => activeUnits.map(unit => {
    const rent = calcLate(unit.rent_amount, `${selectedMonth}-${String(unit.due_day).padStart(2, '0')}`, payDate);
    const share = totalResidents ? utilityTotal / totalResidents * Number(unit.residents) : 0;
    return { unit, share, ...rent, total: rent.total + share };
  }), [activeUnits, selectedMonth, payDate, totalResidents, utilityTotal]);
  const adminHistory = useMemo(() => activeUnits.flatMap(unit => unitHistory(unit, bills, payments, totalResidents).map(row => ({ ...row, unit }))), [activeUnits, bills, payments, totalResidents]);
  const historyPaidTotal = adminHistory.filter(row => row.paid).reduce((sum, row) => sum + row.total, 0);
  const historyOverdue = adminHistory.filter(row => row.overdue);
  const historyOverdueTotal = historyOverdue.reduce((sum, row) => sum + row.total, 0);

  if (!supabase) return <SetupScreen />;
  if (authLoading) return <div className="loading-screen">Carregando Morada…</div>;
  if (!session) return <AuthScreen email={email} setEmail={setEmail} password={password} setPassword={setPassword} error={authError} busy={busy} onSubmit={authenticate} />;
  if (authAction === 'invite' || authAction === 'recovery') return <PasswordSetupScreen password={newPassword} setPassword={setNewPassword} confirmPassword={confirmNewPassword} setConfirmPassword={setConfirmNewPassword} error={authError} busy={busy} onSubmit={setTenantPassword} />;
  if (profileLoading) return <div className="loading-screen">Verificando perfil…</div>;
  if (!profile) return <NoRoleScreen email={session.user.email} notice={notice} onSignOut={() => supabase.auth.signOut()} />;
  if (profile.role === 'tenant') return <TenantPortal unit={units[0]} bill={currentBill} bills={bills} payments={payments} residents={totalResidents} month={selectedMonth} setMonth={setSelectedMonth} payDate={payDate} setPayDate={setPayDate} notice={notice} clearNotice={() => setNotice('')} onSignOut={() => supabase.auth.signOut()} />;

  return <div className="app-shell">
    {mobileNav && <button className="mobile-scrim" aria-label="Fechar menu" onClick={() => setMobileNav(false)}/>}
    <aside className={`sidebar ${mobileNav ? 'mobile-open' : ''}`}>
      <div className="brand"><div className="brand-mark"><Home size={19} strokeWidth={2.4} /></div><span>morada<span className="brand-dot">.</span></span></div>
      <div className="property-switch"><div className="property-icon"><Home size={17}/></div><div><b>Minhas kitnets</b><small>Controle de locação</small></div><ChevronDown size={15}/></div>
      <div className="nav-label">MENU PRINCIPAL</div>
      <nav>{[['Visão geral', Activity], ['Unidades', BedDouble], ['Inquilinos', Users], ['Rateio de contas', CircleDollarSign], ['Pagamentos', Wallet], ['Histórico', CalendarDays], ['Contratos', FileText]].map(([name, Icon]) => <button key={name} className={`nav-item ${tab === name ? 'selected' : ''}`} onClick={() => { setTab(name); setMobileNav(false); }}><Icon size={18}/><span>{name}</span>{name === 'Pagamentos' && dueUnits.length > 0 && <i>{dueUnits.length}</i>}</button>)}</nav>
      <div className="sidebar-bottom"><div className="help-card"><div className="help-icon"><Settings2 size={17}/></div><b>Precisa de ajuda?</b><p>Organize sua rotina e mantenha tudo em dia.</p><button onClick={() => setNotice('Entre em contato pelo e-mail de suporte cadastrado na implantação.')}>Ver orientações <span>→</span></button></div><button className="profile" onClick={() => supabase.auth.signOut()}><div className="avatar">{session.user.email?.slice(0, 1).toUpperCase()}</div><div className="profile-name"><b>{session.user.email}</b><small>Administrador</small></div><LogOut size={17}/></button></div>
    </aside>
    <main className="main-area">
      <header className="topbar"><button className="mobile-menu" aria-label="Abrir menu" onClick={() => setMobileNav(true)}><Menu/></button><div className="breadcrumbs">Morada <span>/</span> <b>{tab}</b></div><div className="top-actions"><span className="today-label"><CalendarDays size={16}/>{new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })}</span><div className="avatar top-avatar">{session.user.email?.slice(0, 1).toUpperCase()}</div></div></header>
      <div className="content">
        {notice && <div className="notice"><span>{notice}</span><button aria-label="Fechar" onClick={() => setNotice('')}><X size={16}/></button></div>}
        {tab === 'Visão geral' && <>
          <section className="page-heading"><div><div className="eyebrow">PAINEL DE CONTROLE</div><h1>Visão geral</h1><p>Acompanhe suas unidades, recebimentos e despesas.</p></div><button className="button primary" onClick={() => { setEditingUnit(null); setShowUnit(true); }}><Plus size={17}/> Nova unidade</button></section>
          <div className="month-toolbar"><div><b>Resumo do mês</b><span>Indicadores de {monthName(selectedMonth)}</span></div><input type="month" max={monthNow} value={selectedMonth} onChange={e => setSelectedMonth(e.target.value)}/></div>
          <section className="stats-grid">
            <StatCard label="Unidades ocupadas" value={`${activeUnits.length} / ${units.length}`} caption={`${totalResidents} moradores cadastrados`} icon={BedDouble} tone="green" trend="Ocupação ativa" />
            <StatCard label="Aluguéis previstos" value={brl(totalRent)} caption={`${activeUnits.length} unidades ativas`} icon={Wallet} tone="blue" trend="Neste mês" />
            <StatCard label="Recebido no mês" value={brl(paidTotal)} caption={`${activeUnits.length - dueUnits.length} de ${activeUnits.length} pagamentos`} icon={ArrowUpRight} tone="purple" trend="Aluguéis + rateio" />
            <StatCard label="Contas para ratear" value={brl(utilityTotal)} caption={`Água ${brl(currentBill?.water_total)} · Luz ${brl(currentBill?.electricity_total)}`} icon={CircleDollarSign} tone="orange" trend={currentBill ? 'Rateio registrado' : 'Sem valores no mês'} />
          </section>
          <section className="overview-grid"><div className="panel units-panel"><div className="panel-heading"><div><h2>Unidades</h2><p>Visão rápida das suas kitnets</p></div><button className="text-link" onClick={() => setTab('Unidades')}>Ver todas <span>→</span></button></div><div className="table-wrap"><table><thead><tr><th>UNIDADE / INQUILINO</th><th>MORADORES</th><th>ALUGUEL</th><th>VENCIMENTO</th><th>STATUS</th></tr></thead><tbody>{units.slice(0, 5).map(unit => <UnitRow key={unit.id} unit={unit} onClick={() => { setEditingUnit(unit); setShowUnit(true); }}/>)}</tbody></table>{units.length === 0 && <EmptyState text="Cadastre sua primeira unidade para começar."/>}</div></div>
          <div className="panel payment-panel"><div className="panel-heading"><div><h2>Recebimentos</h2><p>{monthName(selectedMonth)}</p></div><button className="round-action" onClick={() => setTab('Pagamentos')}><ArrowUpRight size={17}/></button></div><div className="payment-summary"><div className="payment-number">{brl(paidTotal)}</div><div className="payment-caption">de {brl(expectedTotal)} previstos (aluguel + rateio)</div><div className="progress"><span style={{width: `${expectedTotal ? Math.min(100, paidTotal / expectedTotal * 100) : 0}%`}}/></div><div className="progress-label"><span>Recebido</span><b>{expectedTotal ? Math.round(Math.min(100, paidTotal / expectedTotal * 100)) : 0}%</b></div></div><div className="due-list-title">PENDENTES <span>{dueUnits.length}</span></div><div className="due-list">{dueUnits.slice(0, 3).map(u => <div className="due-row" key={u.id}><div className="mini-avatar">{u.tenant_name?.slice(0,1).toUpperCase()}</div><div className="due-name"><b>{u.tenant_name}</b><small>{u.unit_name}</small></div><div className="due-amount">{brl(money(u.rent_amount) + (totalResidents ? utilityTotal / totalResidents * Number(u.residents) : 0))}</div></div>)}{dueUnits.length === 0 && <p className="empty-small">Nenhum aluguel pendente neste mês.</p>}</div><button className="button secondary full" onClick={() => setTab('Pagamentos')}>Acompanhar pagamentos <span>→</span></button></div></section>
          <section className="panel quick-panel"><div className="panel-heading"><div><h2>Rateio de água e luz</h2><p>A divisão considera a quantidade de moradores por unidade.</p></div><button className="button secondary" onClick={() => setShowBill(true)}><Plus size={16}/> Registrar contas</button></div>{currentBill ? <UtilityTable bill={currentBill} units={activeUnits} totalResidents={totalResidents}/> : <EmptyState text="Ainda não há contas registradas para este mês."/>}</section>
        </>}
        {tab === 'Unidades' && <><section className="page-heading"><div><div className="eyebrow">CADASTRO</div><h1>Unidades</h1><p>Inquilinos, moradores, valores e dados dos contratos.</p></div><button className="button primary" onClick={() => {setEditingUnit(null);setShowUnit(true);}}><Plus size={17}/> Nova unidade</button></section><div className="panel full-panel"><div className="list-toolbar"><div className="search-box"><Search size={17}/><input placeholder="Buscar unidade ou inquilino..." value={search} onChange={e => setSearch(e.target.value)}/></div><span>{filteredUnits.length} unidades cadastradas</span></div><div className="table-wrap"><table><thead><tr><th>UNIDADE / INQUILINO</th><th>CONTATO</th><th>MORADORES</th><th>ALUGUEL</th><th>VENCIMENTO</th><th>STATUS</th><th></th></tr></thead><tbody>{filteredUnits.map(u => <UnitRow key={u.id} unit={u} extended onClick={() => {setEditingUnit(u);setShowUnit(true);}} onDelete={() => deleteUnit(u)}/>)}</tbody></table>{filteredUnits.length === 0 && <EmptyState text="Nenhuma unidade encontrada."/>}</div></div></>}
        {tab === 'Inquilinos' && <><section className="page-heading"><div><div className="eyebrow">ACESSO AO PORTAL</div><h1>Inquilinos</h1><p>Gerencie os dados, o acesso e a senha do portal de cada inquilino.</p></div><button className="button primary" onClick={() => setShowTenant(true)}><Plus size={17}/> Convidar inquilino</button></section><div className="panel full-panel"><div className="panel-heading"><div><h2>Contas vinculadas</h2><p>Senhas não podem ser visualizadas; é possível enviar um link seguro para redefinição.</p></div></div><div className="table-wrap"><table><thead><tr><th>E-MAIL DO INQUILINO</th><th>UNIDADE</th><th>INQUILINO CADASTRADO</th><th>ACESSO</th><th>AÇÕES</th></tr></thead><tbody>{profiles.map(person => {const unit=units.find(item=>item.id===person.unit_id);return <tr key={person.user_id}><td>{person.email}</td><td>{unit?.unit_name || 'Unidade não localizada'}</td><td>{unit?.tenant_name || '—'}</td><td><span className="status active"><span/>Portal vinculado</span></td><td><div style={{display:'flex',alignItems:'center',gap:10}}><button className="text-link" disabled={busy} onClick={()=>editTenant(person)} title="Editar nome e dados da unidade"><Pencil size={14}/> Editar</button><button className="text-link" disabled={busy} onClick={()=>manageTenant(person,'reset_password')} title="Enviar link para redefinir senha"><KeyRound size={14}/> Redefinir senha</button><button className="text-link" disabled={busy} onClick={()=>manageTenant(person,'delete')} title="Remover acesso"><Trash2 size={14}/> Remover</button></div></td></tr>})}</tbody></table>{profiles.length===0&&<EmptyState text="Nenhum inquilino foi convidado ainda."/>}</div></div></>}
        {tab === 'Rateio de contas' && <><section className="page-heading"><div><div className="eyebrow">DESPESAS COMPARTILHADAS</div><h1>Rateio de contas</h1><p>O custo por morador é multiplicado pelo total de moradores de cada unidade.</p></div><button className="button primary" onClick={() => setShowBill(true)}><Plus size={17}/> Registrar contas</button></section><div className="month-toolbar"><div><b>Período de apuração</b><span>Selecione o mês das contas de consumo</span></div><input type="month" max={monthNow} value={selectedMonth} onChange={e => setSelectedMonth(e.target.value)}/></div><div className="stats-grid two-stats"><StatCard label="Conta de água" value={brl(currentBill?.water_total)} caption="Total informado no mês" icon={Bath} tone="blue"/><StatCard label="Conta de luz" value={brl(currentBill?.electricity_total)} caption="Total informado no mês" icon={CircleDollarSign} tone="orange"/></div><div className="panel full-panel"><div className="panel-heading"><div><h2>Distribuição por unidade</h2><p>{totalResidents} moradores ativos · base de cálculo: {brl(totalResidents ? utilityTotal / totalResidents : 0)} por morador</p></div></div><UtilityTable bill={currentBill} units={activeUnits} totalResidents={totalResidents}/></div></>}
        {tab === 'Pagamentos' && <><section className="page-heading"><div><div className="eyebrow">CONTROLE FINANCEIRO</div><h1>Pagamentos</h1><p>Consulte os valores de aluguel e registre os recebimentos.</p></div><div className="heading-month"><CalendarDays size={16}/><input type="month" max={monthNow} value={selectedMonth} onChange={e => setSelectedMonth(e.target.value)}/></div></section><div className="panel full-panel"><div className="panel-heading"><div><h2>Cobranças de {monthName(selectedMonth)}</h2><p>Aluguel + cota de água e luz. Multa de 10% e juros simples de 1% ao mês apenas sobre o aluguel.</p></div></div><div className="late-date"><label>Simular pagamento em <input type="date" value={payDate} onChange={e => setPayDate(e.target.value)}/></label><span>O cálculo considera juros diários de 1% ÷ 30.</span></div><div className="table-wrap"><table><thead><tr><th>UNIDADE / INQUILINO</th><th>VENCIMENTO</th><th>ALUGUEL</th><th>RATEIO</th><th>ATRASO</th><th>MULTA</th><th>JUROS</th><th>TOTAL A PAGAR</th><th>STATUS</th></tr></thead><tbody>{lateEstimate.map(({unit,share,days,fine,interest,total}) => {const paid=paidUnitIds.has(unit.id);return <tr key={unit.id}><td><div className="unit-cell"><div className="unit-icon"><Home size={16}/></div><div><b>{unit.unit_name}</b><small>{unit.tenant_name}</small></div></div></td><td>{dateBR(`${selectedMonth}-${String(unit.due_day).padStart(2,'0')}`)}</td><td>{brl(unit.rent_amount)}</td><td>{brl(share)}</td><td>{days ? `${days} dias` : '—'}</td><td>{days ? brl(fine) : '—'}</td><td>{days ? brl(interest) : '—'}</td><td><b>{brl(total)}</b></td><td>{paid ? <span className="status paid"><Check size={13}/> Pago</span> : <button className="button tiny" onClick={() => registerPayment(unit, selectedMonth, total, payDate)}>Registrar pago</button>}</td></tr>})}</tbody></table>{units.length === 0 && <EmptyState text="Cadastre unidades para acompanhar pagamentos."/>}</div></div></>}
        {tab === 'Histórico' && <><section className="page-heading"><div><div className="eyebrow">CONTROLE FINANCEIRO</div><h1>Histórico mensal</h1><p>Pagamentos recebidos e cobranças em aberto até {monthName(monthNow)}.</p></div></section><section className="stats-grid two-stats"><StatCard label="Total recebido" value={brl(historyPaidTotal)} caption="Pagamentos registrados nos meses exibidos" icon={ArrowUpRight} tone="green"/><StatCard label="Em atraso" value={brl(historyOverdueTotal)} caption={`${historyOverdue.length} cobranças vencidas`} icon={CircleAlert} tone="orange"/></section><div className="panel full-panel"><div className="panel-heading"><div><h2>Histórico por unidade e mês</h2><p>Os valores pagos vêm dos registros; cobranças ainda não pagas são calculadas até hoje.</p></div></div><HistoryTable rows={adminHistory} showUnit onRegister={(row) => registerPayment(row.unit, row.month, row.total, today)} emptyText="Não há unidades ativas para exibir."/><p className="history-note">Observação: para meses sem pagamento registrado, aluguel e rateio usam os valores e moradores cadastrados atualmente. Os encargos são calculados individualmente desde o vencimento de cada mês.</p></div></>}
        {tab === 'Contratos' && <><section className="page-heading"><div><div className="eyebrow">DOCUMENTAÇÃO</div><h1>Contratos</h1><p>Consulte prazos e informações contratuais das unidades.</p></div><button className="button primary" onClick={() => {setEditingUnit(null);setShowUnit(true);}}><Plus size={17}/> Novo contrato</button></section><div className="contract-grid">{units.map(u => <div className="panel contract-card" key={u.id}><div className="contract-top"><div className="unit-icon"><FileText size={18}/></div><span className={`status ${u.status==='ativa'?'active':'inactive'}`}>{u.status==='ativa'?'Ativo':'Inativo'}</span></div><h3>{u.unit_name}</h3><p>{u.tenant_name}</p><div className="contract-detail"><span>Nº do contrato</span><b>{u.contract_number || 'Não informado'}</b></div><div className="contract-detail"><span>Vigência</span><b>{dateBR(u.contract_start)} — {dateBR(u.contract_end)}</b></div>{u.contract_url ? <a className="text-link" href={u.contract_url} target="_blank" rel="noreferrer">Abrir documento ↗</a> : <button className="text-link" onClick={() => {setEditingUnit(u);setShowUnit(true);}}>Adicionar documento →</button>}</div>)}{units.length===0&&<div className="panel"><EmptyState text="Cadastre uma unidade e seus dados contratuais."/></div>}</div></>}
      </div>
    </main>
    <AppVersion />
    {showUnit && <Modal title={editingUnit ? 'Editar unidade' : 'Cadastrar unidade'} onClose={() => {setShowUnit(false);setEditingUnit(null);}}><form className="form-grid" onSubmit={saveUnit}><label>Nome da unidade<input name="unit_name" required placeholder="Ex.: Kitnet 01" defaultValue={editingUnit?.unit_name}/></label><label>Nome do inquilino<input name="tenant_name" required placeholder="Nome completo" defaultValue={editingUnit?.tenant_name}/></label><label>Telefone<input name="phone" placeholder="(00) 00000-0000" defaultValue={editingUnit?.phone}/></label><label>Quantidade de moradores<input name="residents" type="number" min="1" required defaultValue={editingUnit?.residents || 1}/></label><label>Valor do aluguel (R$)<input name="rent_amount" type="number" step="0.01" min="0" required defaultValue={editingUnit?.rent_amount}/></label><label>Dia de vencimento<input name="due_day" type="number" min="1" max="28" required defaultValue={editingUnit?.due_day || 10}/></label><div className="form-section">Dados do contrato <span>Opcional</span></div><label>Número do contrato<input name="contract_number" placeholder="Ex.: CT-2026-01" defaultValue={editingUnit?.contract_number}/></label><label>Status<select name="status" defaultValue={editingUnit?.status || 'ativa'}><option value="ativa">Ativa</option><option value="inativa">Inativa</option></select></label><label>Início da vigência<input name="contract_start" type="date" defaultValue={editingUnit?.contract_start}/></label><label>Fim da vigência<input name="contract_end" type="date" defaultValue={editingUnit?.contract_end}/></label><label className="span-two">Link do contrato (arquivo em armazenamento seguro)<input name="contract_url" type="url" placeholder="https://..." defaultValue={editingUnit?.contract_url}/></label><div className="form-actions"><button type="button" className="button secondary" onClick={() => setShowUnit(false)}>Cancelar</button><button className="button primary" disabled={busy}>{busy ? 'Salvando…' : 'Salvar unidade'}</button></div></form></Modal>}
    {showTenant && <Modal title="Convidar inquilino" onClose={() => setShowTenant(false)}><form className="form-grid" onSubmit={inviteTenant}><p className="modal-intro span-two">O inquilino receberá um convite por e-mail para criar a senha e consultar somente a unidade vinculada.</p><label className="span-two">E-mail do inquilino<input type="email" name="email" required placeholder="inquilino@email.com"/></label><label className="span-two">Unidade<select name="unit_id" required defaultValue=""><option value="" disabled>Selecione uma unidade</option>{units.filter(unit=>unit.status==='ativa'&&!profiles.some(person=>person.unit_id===unit.id)).map(unit=><option key={unit.id} value={unit.id}>{unit.unit_name} — {unit.tenant_name}</option>)}</select></label><div className="form-actions"><button type="button" className="button secondary" onClick={() => setShowTenant(false)}>Cancelar</button><button className="button primary" disabled={busy}>{busy?'Enviando convite…':'Enviar convite'}</button></div></form></Modal>}
    {showBill && <Modal title="Registrar contas do mês" onClose={() => setShowBill(false)}><form className="form-grid" onSubmit={saveBill}><p className="modal-intro span-two">Informe os valores totais das contas. O sistema dividirá a soma pelo número de moradores ativos e calculará a cota de cada unidade.</p><label>Mês de referência<input type="month" name="month" required max={monthNow} defaultValue={selectedMonth}/></label><label>Conta de água (R$)<input type="number" name="water_total" min="0" step="0.01" required defaultValue={currentBill?.water_total || ''}/></label><label>Conta de luz (R$)<input type="number" name="electricity_total" min="0" step="0.01" required defaultValue={currentBill?.electricity_total || ''}/></label><div className="split-preview span-two"><Users size={18}/><span>Rateio estimado por morador: <b>{brl(totalResidents ? utilityTotal / totalResidents : 0)}</b> · moradores ativos: <b>{totalResidents}</b></span></div><div className="form-actions"><button type="button" className="button secondary" onClick={() => setShowBill(false)}>Cancelar</button><button className="button primary" disabled={busy}>{busy ? 'Salvando…' : 'Salvar rateio'}</button></div></form></Modal>}
  </div>;
}

function StatCard({label,value,caption,icon:Icon,tone,trend}) { return <div className="stat-card"><div className={`stat-icon ${tone}`}><Icon size={19}/></div><div className="stat-label">{label}</div><div className="stat-value">{value}</div><div className="stat-caption">{caption}</div><div className="stat-trend"><span className={`trend-dot ${tone}`}/>{trend}</div></div>; }
function UnitRow({unit,extended,onClick,onDelete}) { return <tr className="click-row" onClick={onClick}><td><div className="unit-cell"><div className="unit-icon"><Home size={16}/></div><div><b>{unit.unit_name}</b><small>{unit.tenant_name}</small></div></div></td>{extended&&<td>{unit.phone || '—'}</td>}<td><span className="resident-tag"><Users size={13}/>{unit.residents}</span></td><td><b>{brl(unit.rent_amount)}</b></td><td>Dia {unit.due_day}</td><td><span className={`status ${unit.status==='ativa'?'active':'inactive'}`}><span/>{unit.status==='ativa'?'Ativa':'Inativa'}</span></td>{extended&&<td><button className="delete-button" aria-label="Excluir unidade" onClick={e=>{e.stopPropagation();onDelete?.();}}><X size={16}/></button></td>}</tr>; }
function UtilityTable({bill,units,totalResidents}) { if (!bill) return <EmptyState text="Ainda não há contas registradas para este mês."/>; const perResident=totalResidents?(money(bill.water_total)+money(bill.electricity_total))/totalResidents:0; return <div className="table-wrap"><table><thead><tr><th>UNIDADE / INQUILINO</th><th>MORADORES</th><th>ÁGUA</th><th>LUZ</th><th>TOTAL DA COTA</th></tr></thead><tbody>{units.map(u=><tr key={u.id}><td><div className="unit-cell"><div className="unit-icon"><Home size={16}/></div><div><b>{u.unit_name}</b><small>{u.tenant_name}</small></div></div></td><td><span className="resident-tag"><Users size={13}/>{u.residents}</span></td><td>{brl(totalResidents?money(bill.water_total)/totalResidents*u.residents:0)}</td><td>{brl(totalResidents?money(bill.electricity_total)/totalResidents*u.residents:0)}</td><td><b>{brl(perResident*u.residents)}</b></td></tr>)}</tbody></table></div>; }
function HistoryTable({rows,showUnit=false,onRegister,emptyText='Ainda não há cobranças para exibir.'}) {
  if (!rows.length) return <EmptyState text={emptyText}/>;
  return <div className="table-wrap"><table><thead><tr>{showUnit&&<th>UNIDADE / INQUILINO</th>}<th>MÊS</th><th>VENCIMENTO</th><th>ÁGUA + LUZ</th><th>VALOR</th><th>PAGO EM</th><th>STATUS</th>{onRegister&&<th></th>}</tr></thead><tbody>{rows.map(row=><tr key={`${row.unit?.id || 'tenant'}-${row.month}`}>{showUnit&&<td><div className="unit-cell"><div className="unit-icon"><Home size={16}/></div><div><b>{row.unit.unit_name}</b><small>{row.unit.tenant_name}</small></div></div></td>}<td>{monthName(row.month)}</td><td>{dateBR(row.dueDate)}</td><td>{brl(row.water+row.electricity)}</td><td><b>{brl(row.total)}</b></td><td>{dateBR(row.payment?.paid_at)}</td><td>{row.paid?<span className="status paid"><Check size={13}/> Pago</span>:row.overdue?<span className="status overdue">Vencido · {row.lateDays} dias</span>:<span className="status inactive">Em aberto</span>}</td>{onRegister&&<td>{!row.paid&&<button className="button tiny" onClick={()=>onRegister(row)}>Registrar pagamento</button>}</td>}</tr>)}</tbody></table></div>;
}
function EmptyState({text}) { return <div className="empty-state"><div className="empty-icon"><CircleAlert size={20}/></div><p>{text}</p></div>; }
function Modal({title,onClose,children}) { return <div className="modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)onClose();}}><section className="modal"><div className="modal-header"><h2>{title}</h2><button onClick={onClose} aria-label="Fechar"><X size={19}/></button></div>{children}</section></div>; }
function AuthScreen({email,setEmail,password,setPassword,error,busy,onSubmit}) { return <div className="auth-screen"><div className="auth-card"><div className="brand auth-brand"><div className="brand-mark"><Home size={19}/></div><span>morada<span className="brand-dot">.</span></span></div><div className="eyebrow">GESTÃO DE LOCAÇÃO</div><h1>Bem-vindo de volta</h1><p>Acesse seu painel de gestão de kitnets com segurança.</p><form onSubmit={onSubmit}><label>E-mail<input type="email" required autoComplete="email" placeholder="voce@email.com" value={email} onChange={e=>setEmail(e.target.value)}/></label><label>Senha<input type="password" required autoComplete="current-password" placeholder="Sua senha" value={password} onChange={e=>setPassword(e.target.value)}/></label>{error&&<div className="auth-message">{error}</div>}<button className="button primary auth-submit" disabled={busy}>{busy?'Aguarde…':'Entrar'}</button></form><div className="auth-privacy">Acesso para administrador e inquilinos convidados.</div></div><AppVersion /></div>; }
function NoRoleScreen({email,notice,onSignOut}) { return <div className="auth-screen"><div className="auth-card"><div className="brand auth-brand"><div className="brand-mark"><Home size={19}/></div><span>morada<span className="brand-dot">.</span></span></div><div className="eyebrow">ACESSO AINDA NÃO VINCULADO</div><h1>Fale com o administrador</h1><p>A conta {email} ainda não foi vinculada como administrador ou inquilino. Peça ao administrador para configurar seu acesso.</p>{notice&&<div className="auth-message">{notice}</div>}<button className="button secondary auth-submit" onClick={onSignOut}>Sair</button></div><AppVersion /></div>; }
function PasswordSetupScreen({password,setPassword,confirmPassword,setConfirmPassword,error,busy,onSubmit}) { return <div className="auth-screen"><div className="auth-card"><div className="brand auth-brand"><div className="brand-mark"><Home size={19}/></div><span>morada<span className="brand-dot">.</span></span></div><div className="eyebrow">CONFIGURAÇÃO DE ACESSO</div><h1>Crie sua senha</h1><p>Defina uma senha para entrar no portal do inquilino com seu e-mail.</p><form onSubmit={onSubmit}><label>Senha<input type="password" required minLength="8" autoComplete="new-password" placeholder="Pelo menos 8 caracteres" value={password} onChange={event=>setPassword(event.target.value)}/></label><label>Confirme a senha<input type="password" required minLength="8" autoComplete="new-password" placeholder="Digite a senha novamente" value={confirmPassword} onChange={event=>setConfirmPassword(event.target.value)}/></label>{error&&<div className="auth-message">{error}</div>}<button className="button primary auth-submit" disabled={busy}>{busy?'Salvando…':'Salvar senha e continuar'}</button></form><div className="auth-privacy">Use uma senha única que não use em outros serviços.</div></div><AppVersion /></div>; }
function TenantPortal({unit,bill,bills,payments,residents,month,setMonth,payDate,setPayDate,notice,clearNotice,onSignOut}) {
  if (!unit) return <NoRoleScreen email="inquilino" notice={notice || 'Sua unidade não está vinculada à conta.'} onSignOut={onSignOut}/>;
  const history = unitHistory(unit, bills, payments, residents);
  const overdueHistory = history.filter(row => row.overdue);
  const overdueTotal = overdueHistory.reduce((sum, row) => sum + row.total, 0);
  const dueDate = `${month}-${String(unit.due_day).padStart(2,'0')}`;
  const late = calcLate(unit.rent_amount, dueDate, payDate);
  const waterShare = residents ? money(bill?.water_total) / residents * Number(unit.residents) : 0;
  const electricityShare = residents ? money(bill?.electricity_total) / residents * Number(unit.residents) : 0;
  const total = late.total + waterShare + electricityShare;
  const paid = payments.find(payment => payment.month === month && payment.status === 'pago');
  return <div className="tenant-shell"><header className="tenant-header"><div className="brand"><div className="brand-mark"><Home size={19}/></div><span>morada<span className="brand-dot">.</span></span></div><button className="button secondary" onClick={onSignOut}><LogOut size={15}/> Sair</button></header><main className="tenant-content">{notice&&<div className="notice"><span>{notice}</span><button onClick={clearNotice}><X size={16}/></button></div>}<div className="eyebrow">PORTAL DO INQUILINO</div><h1>Olá, {unit.tenant_name}</h1><p className="tenant-subtitle">Consulte os dados da sua unidade e o demonstrativo mensal.</p><div className="month-toolbar"><div><b>Demonstrativo de cobrança</b><span>{unit.unit_name}</span></div><input aria-label="Mês de referência" type="month" max={monthNow} value={month} onChange={event=>setMonth(event.target.value)}/></div><section className="panel tenant-statement"><div className="statement-header"><div><h2>Resumo da cobrança</h2><p>Vencimento: dia {unit.due_day} · {monthName(month)}</p></div><span className={`status ${paid?'paid':'inactive'}`}>{paid?'Pago':'Em aberto'}</span></div><div className="statement-lines"><div><span>Aluguel</span><b>{brl(unit.rent_amount)}</b></div><div><span>Cota de água</span><b>{brl(waterShare)}</b></div><div><span>Cota de luz</span><b>{brl(electricityShare)}</b></div><div><span>Multa por atraso {late.days?`(${late.days} dias)`:''}</span><b>{late.days?brl(late.fine):brl(0)}</b></div><div><span>Juros por atraso</span><b>{late.days?brl(late.interest):brl(0)}</b></div><div className="statement-total"><span>Total demonstrativo</span><b>{brl(total)}</b></div></div><div className="statement-actions"><label>Simular pagamento em<input type="date" value={payDate} onChange={event=>setPayDate(event.target.value)}/></label><button className="button primary" onClick={()=>window.print()}><FileText size={16}/> Imprimir demonstrativo</button></div><p className="statement-disclaimer">Este documento é apenas um demonstrativo de cobrança, não é boleto bancário e não confirma pagamento. Juros simples de 1% ao mês, proporcionais a 30 dias; multa única de 10% calculada sobre o aluguel.</p></section><section className="panel tenant-unit"><h2>Dados da unidade</h2><div><span>Unidade</span><b>{unit.unit_name}</b></div><div><span>Moradores cadastrados</span><b>{unit.residents}</b></div><div><span>Contrato</span><b>{unit.contract_number || 'Não informado'}</b></div><div><span>Vigência</span><b>{dateBR(unit.contract_start)} — {dateBR(unit.contract_end)}</b></div></section><section className="panel tenant-history"><div className="panel-heading"><div><h2>Histórico mensal</h2><p>Pagamentos e cobranças até {monthName(monthNow)}.</p></div></div><div className="history-summary"><span>{overdueHistory.length} {overdueHistory.length===1?'mês vencido':'meses vencidos'}</span><b>{brl(overdueTotal)}</b></div><HistoryTable rows={history}/><p className="history-note">Valores pagos correspondem aos registros de pagamento. As cobranças em aberto usam aluguel e rateio atuais; multa e juros são calculados desde o vencimento de cada mês.</p></section></main><AppVersion /></div>;
}
function SetupScreen() { return <div className="auth-screen"><div className="auth-card"><div className="brand auth-brand"><div className="brand-mark"><Home size={19}/></div><span>morada<span className="brand-dot">.</span></span></div><div className="eyebrow">CONFIGURAÇÃO NECESSÁRIA</div><h1>Conecte seu banco de dados</h1><p>Configure um projeto Supabase para habilitar acesso seguro e sincronização entre dispositivos.</p><div className="setup-steps"><b>1. Crie um projeto no Supabase</b><b>2. Execute o arquivo supabase/schema.sql no SQL Editor</b><b>3. Copie .env.example para .env.local e informe as chaves do projeto</b><code>VITE_SUPABASE_URL<br/>VITE_SUPABASE_ANON_KEY</code></div><p className="auth-privacy">Consulte o README para as instruções completas de configuração e publicação.</p></div><AppVersion /></div>; }
function AppVersion() { return <footer className="app-version">v{appVersion}</footer>; }

createRoot(document.getElementById('root')).render(<App/>);
