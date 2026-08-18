import React, { useState } from "react";
import { useAuth } from "../contexts/AuthContext";
import { useOrder } from "../contexts/OrderContext";
import { useTranslation } from "../contexts/LanguageContext";
import { ShoppingBag, Users, Building, ShieldCheck, DollarSign, Clock, Info, CheckCircle, ChevronRight, Settings } from "lucide-react";
import { BarChart, Bar, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";

const CURRENCY_RATES = {
  USD: { rate: 1, symbol: "$" },
  BRL: { rate: 5.15, symbol: "R$" },
  EUR: { rate: 0.92, symbol: "€" }
};

const STATUS_COLORS = {
  "Queued": "#eab308",
  "In production": "#3b82f6",
  "Delivered": "#22c55e",
  "Pending Payment": "#ef4444"
};

const filterOrdersByTime = (orders, timeRange) => {
  if (timeRange === "total") return orders;
  const now = new Date();
  const todayStr = now.toISOString().split("T")[0]; // YYYY-MM-DD
  const currentMonthStr = todayStr.substring(0, 7); // YYYY-MM
  const currentYearStr = todayStr.substring(0, 4); // YYYY

  return orders.filter(o => {
    let d = o.createdAt;
    if (!d) return true;

    // Convert '2026-05-27T00:00:00.000Z' to '2026-05-27'
    d = d.split("T")[0];

    if (timeRange === "day") return d === todayStr;
    if (timeRange === "month") return d.startsWith(currentMonthStr);
    if (timeRange === "year") return d.startsWith(currentYearStr);
    return true;
  });
};

const getDeliveryStatus = (createdAtStr, status) => {
  if (status === "Delivered") return { color: "#22c55e", label: "Entregue" };
  if (status === "Cancelled") return { color: "#ef4444", label: "Cancelado" };
  if (!createdAtStr) return { color: "#6b7280", label: "Data Desconhecida" };

  const d = new Date(createdAtStr);
  const deadline = new Date(d.getTime() + 30 * 24 * 60 * 60 * 1000); // +30 dias
  const diffDays = Math.ceil((deadline.getTime() - Date.now()) / (1000 * 60 * 60 * 24));

  if (diffDays > 15) return { color: "#22c55e", label: `${diffDays} dias restantes` };
  if (diffDays > 0) return { color: "#eab308", label: `${diffDays} dias restantes` };
  return { color: "#ef4444", label: "Atrasado!" };
};

const OrderContextMenu = ({ menu, onClose, onUpdateStatus, onViewDetails }) => {
  if (!menu) return null;
  const statuses = ["Queued", "In production", "Delivered"];

  // Calcula se o menu vai vazar a tela para baixo (assumindo altura ~200px)
  const isTooLow = menu.y > window.innerHeight - 200;

  return (
    <>
      <div style={{ position: "fixed", inset: 0, zIndex: 9998 }} onClick={onClose} onContextMenu={(e) => { e.preventDefault(); onClose(); }} />
      <div className="premium-glass-card context-menu" style={{
        position: "fixed",
        top: isTooLow ? 'auto' : menu.y,
        bottom: isTooLow ? (window.innerHeight - menu.y) : 'auto',
        left: menu.x,
        zIndex: 9999,
        padding: "10px", borderRadius: "8px", minWidth: "180px",
        boxShadow: "0 10px 30px rgba(0,0,0,0.2)", border: "1px solid var(--border-color)"
      }}>
        <div style={{ padding: "8px 12px", borderBottom: "1px solid var(--border-color)", marginBottom: "8px" }}>
          <strong style={{ fontSize: "12px", color: "var(--color-hint)" }}>Pedido #{menu.order.id}</strong>
        </div>
        <button className="menu-btn hoverable-row" onClick={() => { onViewDetails(menu.order); onClose(); }} style={{ display: "flex", alignItems: "center", gap: "8px", width: "100%", padding: "8px 12px", background: "none", border: "none", color: "var(--text-color)", cursor: "pointer", borderRadius: "6px", textAlign: "left" }}>
          <Info size={14} /> Ver Detalhes
        </button>
        <div style={{ padding: "8px 12px", fontSize: "11px", color: "var(--color-hint)", textTransform: "uppercase", marginTop: "4px" }}>Alterar Status</div>
        {statuses.map(s => (
          <button key={s} className="menu-btn hoverable-row" onClick={() => { onUpdateStatus(menu.order.id, s); onClose(); }} style={{ display: "flex", alignItems: "center", gap: "8px", width: "100%", padding: "8px 12px", background: "none", border: "none", color: s === menu.order.status ? "var(--primary-accent)" : "var(--text-color)", cursor: "pointer", borderRadius: "6px", textAlign: "left" }}>
            {s === menu.order.status ? <CheckCircle size={14} /> : <ChevronRight size={14} />} {s}
          </button>
        ))}
      </div>
    </>
  );
};

const OrderDetailsModal = ({ order, onClose }) => {
  if (!order) return null;
  const specs = order.customSpecs || {};
  return (
    <div style={{ position: "fixed", inset: 0, backgroundColor: "rgba(0,0,0,0.8)", backdropFilter: "blur(4px)", zIndex: 10000, display: "flex", alignItems: "center", justifyContent: "center" }} onClick={onClose}>
      <div className="premium-glass-card" onClick={e => e.stopPropagation()} style={{ width: "90%", maxWidth: "500px", borderRadius: "16px", overflow: "hidden", position: "relative" }}>
        <div style={{ padding: "24px", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
          <h3 style={{ margin: 0, fontSize: "20px" }}>Detalhes do Pedido #{order.id}</h3>
          <p style={{ margin: "5px 0 0", color: "var(--color-hint)", fontSize: "14px" }}>{order.productName} • Cliente: {order.customerName}</p>
        </div>
        <div style={{ padding: "24px", maxHeight: "60vh", overflowY: "auto" }}>
          <h4 style={{ color: "var(--primary-accent)", marginTop: 0 }}>Especificações Técnicas</h4>
          <ul style={{ listStyle: "none", padding: 0, margin: 0, color: "var(--text-color)" }}>
            {Object.entries(specs).map(([k, v]) => (
              <li key={k} style={{ padding: "10px", backgroundColor: "rgba(255,255,255,0.03)", marginBottom: "8px", borderRadius: "8px", display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "var(--color-hint)", textTransform: "capitalize" }}>{k.replace(/_/g, " ")}:</span>
                <strong>{typeof v === "boolean" ? (v ? "Sim" : "Não") : String(v)}</strong>
              </li>
            ))}
            {Object.keys(specs).length === 0 && <li style={{ color: "var(--color-hint)" }}>Nenhuma especificação customizada.</li>}
          </ul>
        </div>
        <div style={{ padding: "20px", borderTop: "1px solid rgba(255,255,255,0.05)", textAlign: "right" }}>
          <button className="premium-button" onClick={onClose}>Fechar</button>
        </div>
      </div>
    </div>
  );
};

export function FactoryDashboard() {
  const { session } = useAuth();
  const { orders, fetchBackendOrders, updateOrderStatus } = useOrder();
  const { t } = useTranslation();

  if (!session || session.role !== "factory") {
    return <p>Access denied.</p>;
  }

  const [timeRange, setTimeRange] = useState("total");
  const [currency, setCurrency] = useState("USD");
  const [contextMenu, setContextMenu] = useState(null);
  const [selectedOrderDetails, setSelectedOrderDetails] = useState(null);

  const { rate, symbol } = CURRENCY_RATES[currency] || CURRENCY_RATES.USD;

  const allFactoryOrders = orders.filter((o) => String(o.factoryId) === String(session.id));
  const factoryOrders = filterOrdersByTime(allFactoryOrders, timeRange);

  const handleStatusChange = (orderId, newStatus) => {
    updateOrderStatus(orderId, newStatus);
  };

  const handleContextMenu = (e, order) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, order });
  };

  // 1. Calculate Summary Stats
  const totalRevenue = factoryOrders.reduce((sum, order) => sum + (Number(order.total) * rate), 0);
  const totalOrders = factoryOrders.length;
  const avgTicket = totalOrders > 0 ? (totalRevenue / totalOrders).toFixed(2) : 0;

  // 2. Calculate Pie Chart (Status Distribution)
  const statusCount = { Queued: 0, "In production": 0, Delivered: 0, "Pending Payment": 0 };
  factoryOrders.forEach((o) => {
    if (statusCount[o.status] !== undefined) statusCount[o.status]++;
  });
  const pieData = Object.keys(statusCount).map((key) => ({
    name: key,
    value: statusCount[key]
  })).filter(d => d.value > 0);
  const COLORS = ["#eab308", "#3b82f6", "#22c55e", "#ef4444"];

  // 3. Calculate Area Chart (Revenue over time)
  const dateMap = {};
  factoryOrders.forEach(o => {
    const d = o.createdAt ? o.createdAt.split("T")[0] : "Recent";
    if (!dateMap[d]) dateMap[d] = 0;
    dateMap[d] += (Number(o.total) * rate);
  });
  const areaData = Object.keys(dateMap).map(d => ({
    date: d,
    revenue: dateMap[d]
  })).sort((a,b) => a.date.localeCompare(b.date));

  return (
    <div className="factory-dashboard-container" style={{ padding: "40px 20px", maxWidth: "1200px", margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "flex-end", gap: "12px", marginBottom: "10px" }}>
        <select value={timeRange} onChange={(e) => setTimeRange(e.target.value)} className="premium-select" style={{ padding: "8px 12px", borderRadius: "6px" }}>
          <option value="total">Período: Total</option>
          <option value="year">Este Ano</option>
          <option value="month">Este Mês</option>
          <option value="day">Hoje</option>
        </select>
        <select value={currency} onChange={(e) => setCurrency(e.target.value)} className="premium-select" style={{ padding: "8px 12px", borderRadius: "6px" }}>
          <option value="USD">Moeda: USD ($)</option>
          <option value="BRL">Moeda: BRL (R$)</option>
          <option value="EUR">Moeda: EUR (€)</option>
        </select>
      </div>

      <header className="dashboard-header" style={{ marginBottom: "30px" }}>
        <span className="eyebrow" style={{ color: "var(--primary-accent)", fontSize: "12px", textTransform: "uppercase", letterSpacing: "1px" }}>
          Production Line Portal
        </span>
        <h1 style={{ fontSize: "32px", margin: "8px 0" }} id="factoryTitle">
          {session.factoryName || "Partner Factory"} Dashboard
        </h1>
        <p style={{ color: "var(--color-hint)" }}>Track production metrics and manage your pending orders.</p>
      </header>

      {/* Summary Cards */}
      <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: "20px", marginBottom: "40px" }}>
        <div className="premium-glass-card" style={{ padding: "24px", borderRadius: "8px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <span style={{ fontSize: "14px", color: "var(--color-hint)" }}>Total em Vendas</span>
            <strong style={{ display: "block", fontSize: "32px", fontWeight: "700" }}>{symbol}{totalRevenue.toFixed(2)}</strong>
          </div>
          <div style={{ padding: "12px", borderRadius: "8px", backgroundColor: "rgba(16, 185, 129, 0.1)", color: "#10b981" }}>
            <DollarSign size={28} />
          </div>
        </div>

        <div className="premium-glass-card" style={{ padding: "24px", borderRadius: "8px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <span style={{ fontSize: "14px", color: "var(--color-hint)" }}>Total de Produções</span>
            <strong style={{ display: "block", fontSize: "32px", fontWeight: "700" }}>{totalOrders}</strong>
          </div>
          <div style={{ padding: "12px", borderRadius: "8px", backgroundColor: "rgba(99, 102, 241, 0.1)", color: "#6366f1" }}>
            <ShoppingBag size={28} />
          </div>
        </div>

        <div className="premium-glass-card" style={{ padding: "24px", borderRadius: "8px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <span style={{ fontSize: "14px", color: "var(--color-hint)" }}>Ticket Médio</span>
            <strong style={{ display: "block", fontSize: "32px", fontWeight: "700" }}>{symbol}{avgTicket}</strong>
          </div>
          <div style={{ padding: "12px", borderRadius: "8px", backgroundColor: "rgba(234, 179, 8, 0.1)", color: "#eab308" }}>
            <DollarSign size={28} />
          </div>
        </div>
      </section>

      {/* Analytics Charts */}
      <section style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: "20px", marginBottom: "40px" }}>
        <div className="premium-glass-card" style={{ padding: "24px", borderRadius: "8px" }}>
          <h2 style={{ fontSize: "16px", marginBottom: "20px", color: "var(--color-hint)" }}>Desempenho de Vendas</h2>
          <div style={{ height: "300px", width: "100%" }}>
            <ResponsiveContainer>
              <AreaChart data={areaData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorRev" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                <XAxis dataKey="date" stroke="var(--color-hint)" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis stroke="var(--color-hint)" fontSize={12} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={{ backgroundColor: "rgba(10, 10, 15, 0.9)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "8px", color: "#fff" }} />
                <Area type="monotone" dataKey="revenue" stroke="#10b981" fillOpacity={1} fill="url(#colorRev)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="premium-glass-card" style={{ padding: "24px", borderRadius: "8px" }}>
          <h2 style={{ fontSize: "16px", marginBottom: "20px", color: "var(--color-hint)" }}>Distribuição por Status</h2>
          <div style={{ height: "300px", width: "100%" }}>
            <ResponsiveContainer>
              <PieChart>
                <Pie data={pieData} cx="50%" cy="50%" innerRadius={60} outerRadius={80} paddingAngle={5} dataKey="value">
                  {pieData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={STATUS_COLORS[entry.name] || "#8884d8"} />
                  ))}
                </Pie>
                <Tooltip contentStyle={{ backgroundColor: "rgba(10, 10, 15, 0.9)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "8px", color: "#fff" }} />
                <Legend wrapperStyle={{ color: "var(--text-color)", fontSize: "12px" }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </section>

      {/* Orders Table */}
      <section className="dashboard-content premium-glass-card" style={{ borderRadius: "8px", padding: "24px", overflowX: "auto" }}>
        <h2 style={{ fontSize: "18px", marginBottom: "20px" }}>Gerenciar Fila de Produção</h2>
        <table className="dashboard-table premium-table" style={{ width: "100%", minWidth: "800px" }}>
          <thead>
            <tr style={{ textAlign: "left" }}>
              <th>Order ID</th>
              <th>Customer Name</th>
              <th>Product Name</th>
              <th>Prazo (30d)</th>
              <th>Status</th>
              <th>Total</th>
            </tr>
          </thead>
          <tbody id="factoryOrdersBody">
            {factoryOrders.length === 0 ? (
              <tr>
                <td colSpan={6} style={{ padding: "40px", textAlign: "center", color: "var(--color-hint)" }}>
                  No orders routed to your factory yet.
                </td>
              </tr>
            ) : (
              factoryOrders.map((order) => {
                const delivery = getDeliveryStatus(order.createdAt, order.status);
                return (
                <tr key={order.id} onContextMenu={(e) => handleContextMenu(e, order)} style={{ cursor: "context-menu" }} className="hoverable-row">
                  <td style={{ fontWeight: "600" }}>{order.id}</td>
                  <td>{order.customerName}</td>
                  <td>{order.productName}</td>
                  <td>
                    <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                      <span style={{ width: 8, height: 8, borderRadius: "50%", backgroundColor: delivery.color }}></span>
                      <span style={{ fontSize: "12px", color: "var(--color-hint)" }}>{delivery.label}</span>
                    </div>
                  </td>
                  <td>
                    <span
                      style={{
                        display: "inline-block",
                        padding: "4px 8px",
                        borderRadius: "4px",
                        fontSize: "11px",
                        fontWeight: "600",
                        textTransform: "uppercase",
                        backgroundColor:
                          order.status === "Delivered"
                            ? "rgba(34, 197, 94, 0.1)"
                            : order.status === "In production"
                            ? "rgba(59, 130, 246, 0.1)"
                            : "rgba(234, 179, 8, 0.1)",
                        color:
                          order.status === "Delivered"
                            ? "#22c55e"
                            : order.status === "In production"
                            ? "#3b82f6"
                            : "#eab308"
                      }}
                    >
                      {order.status}
                    </span>
                  </td>
                  <td>{symbol}{(Number(order.total) * rate).toFixed(2)}</td>
                </tr>
              )})
            )}
          </tbody>
        </table>
      </section>

      <OrderContextMenu menu={contextMenu} onClose={() => setContextMenu(null)} onUpdateStatus={handleStatusChange} onViewDetails={setSelectedOrderDetails} />
      <OrderDetailsModal order={selectedOrderDetails} onClose={() => setSelectedOrderDetails(null)} />
    </div>
  );
}

export function StaffDashboard() {
  const { session, users } = useAuth();
  const { orders: allStaffOrders, updateOrderStatus } = useOrder();

  if (!session || session.role !== "staff") {
    return <p>Access denied.</p>;
  }

  const [timeRange, setTimeRange] = useState("total");
  const [currency, setCurrency] = useState("USD");
  const [contextMenu, setContextMenu] = useState(null);
  const [selectedOrderDetails, setSelectedOrderDetails] = useState(null);

  const { rate, symbol } = CURRENCY_RATES[currency] || CURRENCY_RATES.USD;

  const orders = filterOrdersByTime(allStaffOrders, timeRange);

  const handleStatusChange = (orderId, newStatus) => {
    updateOrderStatus(orderId, newStatus);
  };

  const handleContextMenu = (e, order) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, order });
  };

  const clientsCount = users.filter((u) => u.role === "client").length;
  const factoriesCount = users.filter((u) => u.role === "factory").length;
  const staffCount = users.filter((u) => u.role === "staff").length;

  // Analytics Calculations
  const totalRevenue = orders.reduce((sum, order) => sum + (Number(order.total) * rate), 0);

  const statusCount = { Queued: 0, "In production": 0, Delivered: 0, "Pending Payment": 0 };
  orders.forEach((o) => {
    if (statusCount[o.status] !== undefined) statusCount[o.status]++;
  });

  const pieData = Object.keys(statusCount).map((key) => ({
    name: key,
    value: statusCount[key]
  })).filter(d => d.value > 0);

  const factoryMap = {};
  orders.forEach((o) => {
    const fname = o.factoryName || "Unknown";
    if (!factoryMap[fname]) factoryMap[fname] = 0;
    factoryMap[fname] += (Number(o.total) * rate);
  });
  const barData = Object.keys(factoryMap).map((key) => ({
    name: key,
    revenue: Number(factoryMap[key].toFixed(2))
  }));

  return (
    <div className="staff-dashboard-container" style={{ padding: "40px 20px", maxWidth: "1200px", margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "flex-end", gap: "12px", marginBottom: "10px" }}>
        <select value={timeRange} onChange={(e) => setTimeRange(e.target.value)} className="premium-select" style={{ padding: "8px 12px", borderRadius: "6px" }}>
          <option value="total">Período: Total</option>
          <option value="year">Este Ano</option>
          <option value="month">Este Mês</option>
          <option value="day">Hoje</option>
        </select>
        <select value={currency} onChange={(e) => setCurrency(e.target.value)} className="premium-select" style={{ padding: "8px 12px", borderRadius: "6px" }}>
          <option value="USD">Moeda: USD ($)</option>
          <option value="BRL">Moeda: BRL (R$)</option>
          <option value="EUR">Moeda: EUR (€)</option>
        </select>
      </div>

      <header className="dashboard-header" style={{ marginBottom: "35px" }}>
        <span className="eyebrow" style={{ color: "var(--primary-accent)", fontSize: "12px", textTransform: "uppercase", letterSpacing: "1px" }}>
          Platform Management Console
        </span>
        <h1 style={{ fontSize: "32px", margin: "8px 0" }}>Operations Dashboard</h1>
        <p style={{ color: "var(--color-hint)" }}>Core metrics, platform users database, and order dispatch status.</p>
      </header>

      {/* Summary Stats Widgets */}
      <section
        className="summary-stats-grid"
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: "20px",
          marginBottom: "40px"
        }}
        id="staffSummary"
      >
        <div
          className="summary-card premium-glass-card"
          style={{
            padding: "20px",
            borderRadius: "8px",
            display: "flex",
            alignItems: "center",
            gap: "16px"
          }}
        >
          <div style={{ padding: "10px", borderRadius: "6px", backgroundColor: "rgba(16, 185, 129, 0.1)", color: "#10b981" }}>
            <DollarSign size={24} />
          </div>
          <div>
            <strong style={{ display: "block", fontSize: "28px", fontWeight: "700" }}>{symbol}{totalRevenue.toFixed(2)}</strong>
            <span style={{ fontSize: "13px", color: "var(--color-hint)" }}>Total Revenue</span>
          </div>
        </div>

        <div
          className="summary-card premium-glass-card"
          style={{
            padding: "20px",
            borderRadius: "8px",
            display: "flex",
            alignItems: "center",
            gap: "16px"
          }}
        >
          <div style={{ padding: "10px", borderRadius: "6px", backgroundColor: "rgba(99, 102, 241, 0.1)", color: "#6366f1" }}>
            <ShoppingBag size={24} />
          </div>
          <div>
            <strong style={{ display: "block", fontSize: "28px", fontWeight: "700" }}>{orders.length}</strong>
            <span style={{ fontSize: "13px", color: "var(--color-hint)" }}>Total Orders</span>
          </div>
        </div>

        <div
          className="summary-card premium-glass-card"
          style={{
            padding: "20px",
            borderRadius: "8px",
            display: "flex",
            alignItems: "center",
            gap: "16px"
          }}
        >
          <div style={{ padding: "10px", borderRadius: "6px", backgroundColor: "rgba(34, 197, 94, 0.1)", color: "#22c55e" }}>
            <Users size={24} />
          </div>
          <div>
            <strong style={{ display: "block", fontSize: "28px", fontWeight: "700" }}>{clientsCount}</strong>
            <span style={{ fontSize: "13px", color: "var(--color-hint)" }}>Clients</span>
          </div>
        </div>

        <div
          className="summary-card premium-glass-card"
          style={{
            padding: "20px",
            borderRadius: "8px",
            display: "flex",
            alignItems: "center",
            gap: "16px"
          }}
        >
          <div style={{ padding: "10px", borderRadius: "6px", backgroundColor: "rgba(234, 179, 8, 0.1)", color: "#eab308" }}>
            <Building size={24} />
          </div>
          <div>
            <strong style={{ display: "block", fontSize: "28px", fontWeight: "700" }}>{factoriesCount}</strong>
            <span style={{ fontSize: "13px", color: "var(--color-hint)" }}>Partner Factories</span>
          </div>
        </div>

        <div
          className="summary-card premium-glass-card"
          style={{
            padding: "20px",
            borderRadius: "8px",
            display: "flex",
            alignItems: "center",
            gap: "16px"
          }}
        >
          <div style={{ padding: "10px", borderRadius: "6px", backgroundColor: "rgba(236, 72, 153, 0.1)", color: "#ec4899" }}>
            <ShieldCheck size={24} />
          </div>
          <div>
            <strong style={{ display: "block", fontSize: "28px", fontWeight: "700" }}>{staffCount}</strong>
            <span style={{ fontSize: "13px", color: "var(--color-hint)" }}>Staff</span>
          </div>
        </div>
      </section>

      {/* Analytics Charts Section */}
      <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(400px, 1fr))", gap: "20px", marginBottom: "40px" }}>
        <div className="premium-glass-card" style={{ padding: "20px", borderRadius: "8px" }}>
          <h2 style={{ fontSize: "18px", marginBottom: "20px" }}>Revenue by Factory</h2>
          <div style={{ height: "300px", width: "100%" }}>
            <ResponsiveContainer>
              <BarChart data={barData} margin={{ top: 20, right: 30, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                <XAxis dataKey="name" stroke="var(--text-color)" fontSize={12} />
                <YAxis stroke="var(--text-color)" fontSize={12} />
                <Tooltip contentStyle={{ backgroundColor: "rgba(10, 10, 15, 0.9)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "8px", color: "#fff" }} />
                <Bar dataKey="revenue" fill="#6366f1" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="premium-glass-card" style={{ padding: "20px", borderRadius: "8px" }}>
          <h2 style={{ fontSize: "18px", marginBottom: "20px" }}>Order Status Distribution</h2>
          <div style={{ height: "300px", width: "100%" }}>
            <ResponsiveContainer>
              <PieChart>
                <Pie data={pieData} cx="50%" cy="50%" innerRadius={70} outerRadius={100} paddingAngle={5} dataKey="value" stroke="none">
                  {pieData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={STATUS_COLORS[entry.name] || "#8884d8"} />
                  ))}
                </Pie>
                <Tooltip contentStyle={{ backgroundColor: "rgba(10, 10, 15, 0.9)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "8px", color: "#fff" }} />
                <Legend wrapperStyle={{ color: "var(--text-color)", fontSize: "12px" }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </section>

      {/* Grid of Tables */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: "40px" }}>

        {/* Table 1: Orders */}
        <section className="premium-glass-card" style={{ borderRadius: "8px", padding: "20px" }}>
          <h2 style={{ fontSize: "18px", marginBottom: "16px" }}>Platform Orders Log</h2>
          <div style={{ overflowX: "auto" }}>
            <table className="dashboard-table premium-table" style={{ width: "100%", minWidth: "700px" }}>
              <thead>
                <tr style={{ textAlign: "left" }}>
                  <th>Order ID</th>
                  <th>Client</th>
                  <th>Product</th>
                  <th>Factory Partner</th>
                  <th>Prazo (30d)</th>
                  <th>Status</th>
                  <th>Total</th>
                </tr>
              </thead>
              <tbody id="staffOrdersBody">
                {orders.map((order) => {
                  const delivery = getDeliveryStatus(order.createdAt, order.status);
                  return (
                  <tr key={order.id} onContextMenu={(e) => handleContextMenu(e, order)} style={{ cursor: "context-menu" }} className="hoverable-row">
                    <td style={{ fontWeight: "600" }}>{order.id}</td>
                    <td>{order.customerName}</td>
                    <td>{order.productName}</td>
                    <td>{order.factoryName}</td>
                    <td>
                      <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                        <span style={{ width: 8, height: 8, borderRadius: "50%", backgroundColor: delivery.color }}></span>
                        <span style={{ fontSize: "12px", color: "var(--color-hint)" }}>{delivery.label}</span>
                      </div>
                    </td>
                    <td>
                      <span
                        style={{
                          display: "inline-block",
                          padding: "3px 6px",
                          borderRadius: "4px",
                          fontSize: "11px",
                          fontWeight: "600",
                          backgroundColor:
                            order.status === "Delivered"
                              ? "rgba(34, 197, 94, 0.1)"
                              : order.status === "In production"
                              ? "rgba(59, 130, 246, 0.1)"
                              : "rgba(234, 179, 8, 0.1)",
                          color:
                            order.status === "Delivered"
                              ? "#22c55e"
                              : order.status === "In production"
                              ? "#3b82f6"
                              : "#eab308"
                        }}
                      >
                        {order.status}
                      </span>
                    </td>
                    <td>{symbol}{(Number(order.total) * rate).toFixed(2)}</td>
                  </tr>
                )})}
              </tbody>
            </table>
          </div>
        </section>

        {/* Table 2: Users */}
        <section className="premium-glass-card" style={{ borderRadius: "8px", padding: "20px" }}>
          <h2 style={{ fontSize: "18px", marginBottom: "16px" }}>Platform Registered Users</h2>
          <div style={{ overflowX: "auto" }}>
            <table className="dashboard-table premium-table" style={{ width: "100%", minWidth: "700px" }}>
              <thead>
                <tr style={{ textAlign: "left" }}>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Role</th>
                  <th>Factory Affiliation</th>
                </tr>
              </thead>
              <tbody id="staffUsersBody">
                {users.map((user) => (
                  <tr key={user.id}>
                    <td style={{ fontWeight: "600" }}>{user.name}</td>
                    <td>{user.email}</td>
                    <td>
                      <span
                        style={{
                          fontSize: "11px",
                          fontWeight: "700",
                          textTransform: "uppercase",
                          color:
                            user.role === "staff"
                              ? "#ec4899"
                              : user.role === "factory"
                              ? "#eab308"
                              : "#22c55e"
                        }}
                      >
                        {user.role}
                      </span>
                    </td>
                    <td>{user.factoryName || "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      <OrderContextMenu menu={contextMenu} onClose={() => setContextMenu(null)} onUpdateStatus={handleStatusChange} onViewDetails={setSelectedOrderDetails} />
      <OrderDetailsModal order={selectedOrderDetails} onClose={() => setSelectedOrderDetails(null)} />
    </div>
  );
}
