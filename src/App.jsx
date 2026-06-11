import React, { useState, useEffect, useMemo } from 'react';
import * as XLSX from 'xlsx';
import { 
  Package, ShoppingCart, AlertCircle, CheckCircle2, 
  Search, Filter, ChevronLeft, ChevronRight,
  Edit2, Trash2, Bell, Settings, LogOut,
  LayoutDashboard, Truck, Users, FileText,
  AlertTriangle, FilePlus, Save
} from 'lucide-react';
import './index.css';

// --- MOCK DATA ---
const initialProducts = [
  { id: 1, sku: 'KC001', name: 'Kim may công nghiệp số 11', stock: 120, sales1M: 35, monthlySales: [30, 35, 40, 50, 20, 10, 0, 0, 0, 0, 0, 0], maxSales: 50, source: 'Nhà cung cấp A', importQty: 0, status: 'Chưa cần nhập', note: '', isManual: false },
  { id: 2, sku: 'CV005', name: 'Chân vịt viền', stock: 15, sales1M: 80, monthlySales: [60, 70, 80, 100, 90, 85, 0, 0, 0, 0, 0, 0], maxSales: 100, source: 'Xưởng may B', importQty: 50, status: 'Cần nhập', note: 'Sắp hết hàng', isManual: false },
  { id: 3, sku: 'TH020', name: 'Thun bản 2cm màu trắng', stock: 30, sales1M: 150, monthlySales: [120, 150, 160, 200, 180, 190, 0, 0, 0, 0, 0, 0], maxSales: 200, source: 'Đại lý C', importQty: 100, status: 'Cần nhập', note: 'Nhập thêm trước cuối tuần', isManual: false },
  { id: 4, sku: 'DCK03', name: 'Dây kéo 3 phân đen', stock: 200, sales1M: 45, monthlySales: [45, 40, 50, 60, 55, 45, 0, 0, 0, 0, 0, 0], maxSales: 60, source: 'Nhà cung cấp A', importQty: 0, status: 'Chưa cần nhập', note: '', isManual: false },
  { id: 5, sku: 'MB002', name: 'Mũi kim DBx1 #11', stock: 60, sales1M: 25, monthlySales: [20, 25, 30, 40, 35, 25, 0, 0, 0, 0, 0, 0], maxSales: 40, source: 'Xưởng may B', importQty: 0, status: 'Sắp cần nhập', note: '', isManual: false },
  { id: 6, sku: 'CT001', name: 'Chỉ may cotton trắng', stock: 25, sales1M: 60, monthlySales: [50, 60, 70, 90, 80, 75, 0, 0, 0, 0, 0, 0], maxSales: 90, source: 'Đại lý C', importQty: 50, status: 'Cần nhập', note: 'Sắp hết', isManual: false },
  { id: 7, sku: 'NH001', name: 'Nhãn dệt size M', stock: 300, sales1M: 20, monthlySales: [15, 20, 25, 40, 30, 20, 0, 0, 0, 0, 0, 0], maxSales: 40, source: 'Nhà cung cấp A', importQty: 0, status: 'Chưa cần nhập', note: '', isManual: false },
  { id: 8, sku: 'PK001', name: 'Phấn may màu xanh', stock: 18, sales1M: 40, monthlySales: [30, 40, 50, 60, 55, 45, 0, 0, 0, 0, 0, 0], maxSales: 60, source: 'Xưởng may B', importQty: 20, status: 'Sắp cần nhập', note: '', isManual: false },
];

const initialSuppliers = [
  { id: 1, name: 'Nhà cung cấp A', contact: '123 Đường A, Quận 1, TP.HCM', phone: '0901234567', rating: 'Tốt' },
  { id: 2, name: 'Xưởng may B', contact: '456 Đường B, Quận 2, TP.HCM', phone: '0912345678', rating: 'Khá' },
  { id: 3, name: 'Đại lý C', contact: '789 Đường C, Quận 3, TP.HCM', phone: '0987654321', rating: 'Tốt' },
];

function App() {
  const [activeMenu, setActiveMenu] = useState('nhap-hang');
  const [activeTab, setActiveTab] = useState('san-pham');
  const [products, setProducts] = useState(initialProducts);
  const [selectedForReceipt, setSelectedForReceipt] = useState([]);
  const [suppliers, setSuppliers] = useState(initialSuppliers);
  const [editingSupplierId, setEditingSupplierId] = useState(null);
  const [showMonths, setShowMonths] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showManualAddModal, setShowManualAddModal] = useState(false);
  const [showEditProductModal, setShowEditProductModal] = useState(false);
  const [editProduct, setEditProduct] = useState(null);
  const [filterSource, setFilterSource] = useState('Tất cả');
  const [newProduct, setNewProduct] = useState({
    sku: '',
    name: '',
    stock: 0,
    source: initialSuppliers[0].name
  });

  const handleSupplierChange = (id, field, value) => {
    setSuppliers(suppliers.map(s => s.id === id ? { ...s, [field]: value } : s));
  };

  // Hàm tính toán tự động số cần nhập và trạng thái
  const recalculateProduct = (p) => {
    // Công thức: Số cần nhập = Max Sales - Tồn kho
    let calculatedImport = p.maxSales - p.stock;
    if (calculatedImport < 0) calculatedImport = 0;
    
    // Nếu người dùng không chỉnh sửa thủ công, cập nhật số cần nhập theo tính toán
    let finalImportQty = p.isManual ? p.importQty : calculatedImport;
    
    let status = 'Chưa cần nhập';
    if (p.maxSales > 0) {
      const percent = (p.stock / p.maxSales) * 100;
      if (percent <= 20) status = 'Cần nhập';
      else if (percent <= 49) status = 'Sắp cần nhập';
    }

    return { ...p, importQty: finalImportQty, status };
  };

  const handleMonthlySalesChange = (id, monthIndex, value) => {
    setProducts(products.map(p => {
      if (p.id === id) {
        const val = parseInt(value) || 0;
        const newMonthlySales = [...p.monthlySales];
        newMonthlySales[monthIndex] = val;
        
        const newMaxSales = Math.max(...newMonthlySales);
        let updated = { ...p, monthlySales: newMonthlySales };
        if (!p.isManual) {
          updated.maxSales = newMaxSales;
          return recalculateProduct(updated);
        }
        return updated;
      }
      return p;
    }));
  };

  const handleNoteChange = (id, newNote) => {
    setProducts(products.map(p => {
      if (p.id === id) {
        return { ...p, note: newNote };
      }
      return p;
    }));
  };

  const handleSourceChange = (id, newSource) => {
    setProducts(products.map(p => {
      if (p.id === id) {
        return { ...p, source: newSource };
      }
      return p;
    }));
  };

  const handleMaxSalesChange = (id, newMaxSales) => {
    setProducts(products.map(p => {
      if (p.id === id) {
        const val = parseInt(newMaxSales) || 0;
        const updated = { ...p, maxSales: val, isManual: true };
        return recalculateProduct(updated);
      }
      return p;
    }));
  };

  const handleImportQtyChange = (id, newQty) => {
    setProducts(products.map(p => {
      if (p.id === id) {
        const val = parseInt(newQty) || 0;
        return { ...p, importQty: val, isManual: true };
      }
      return p;
    }));
  };

  const openEditProductModal = (product) => {
    setEditProduct({ ...product });
    setShowEditProductModal(true);
  };

  // Toggle selection for receipt (Tab 2)
  const toggleSelectProduct = (id) => {
    if (selectedForReceipt.includes(id)) {
      setSelectedForReceipt(selectedForReceipt.filter(itemId => itemId !== id));
    } else {
      setSelectedForReceipt([...selectedForReceipt, id]);
    }
  };

  const selectAllReceipt = () => {
    const importableProducts = products.filter(p => p.importQty > 0);
    if (selectedForReceipt.length === importableProducts.length) {
      setSelectedForReceipt([]);
    } else {
      setSelectedForReceipt(importableProducts.map(p => p.id));
    }
  };

  const handleDownloadTemplate = () => {
    const headers = [
      'SKU', 'Ten san pham', 'Ton kho', 'Nguon nhap',
      'T1', 'T2', 'T3', 'T4', 'T5', 'T6', 
      'T7', 'T8', 'T9', 'T10', 'T11', 'T12', 'Ghi chu'
    ];
    
    const sampleRow = [
      'SP001', 'San pham mau', '100', 'Nha cung cap A',
      '10', '15', '20', '0', '0', '0',
      '0', '0', '0', '0', '0', '0', 'Ghi chu mau'
    ];

    const csvContent = "\uFEFF" + headers.join(',') + "\n" + sampleRow.join(',');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", "Form_Nhap_San_Pham.csv");
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const fileInputRef = React.useRef(null);

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      const data = new Uint8Array(evt.target.result);
      const workbook = XLSX.read(data, { type: 'array' });
      const firstSheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[firstSheetName];
      const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });

      if (rows.length <= 1) {
        alert('File không có dữ liệu hợp lệ!');
        return; 
      }
      
      setProducts(prevProducts => {
        const updatedProducts = [...prevProducts];
        let currentMaxId = Math.max(0, ...updatedProducts.map(p => p.id));
        let addedCount = 0;
        let updatedCount = 0;

        const normalizeHeader = (h) => String(h).toUpperCase().replace(/["'\r]/g, '').trim();

        const headers = rows[0].map(normalizeHeader);
        let skuIdx = headers.findIndex(h => h.includes('SKU') || h.includes('MÃ SẢN PHẨM') || h.includes('MA SAN PHAM'));
        let stockIdx = headers.findIndex(h => h.includes('TỒN KHO') || h.includes('TON KHO'));
        let nameIdx = headers.findIndex(h => h.includes('TÊN SẢN PHẨM') || h.includes('TEN SAN PHAM'));
        let sourceIdx = headers.findIndex(h => h.includes('NGUỒN NHẬP') || h.includes('NGUON NHAP'));

        if (skuIdx === -1) skuIdx = 0;
        if (nameIdx === -1) nameIdx = 1;
        if (stockIdx === -1) stockIdx = headers.length >= 16 ? 2 : 5;

        for (let i = 1; i < rows.length; i++) {
          const cols = rows[i];
          if (!cols || cols.length === 0 || cols.every(c => c === '')) continue;
          
          const sku = String(cols[skuIdx] || '').trim();
          if (!sku) continue; 
          
          const name = nameIdx !== -1 && cols[nameIdx] ? String(cols[nameIdx]) : 'Sản phẩm mới';
          const stock = parseInt(String(cols[stockIdx]).replace(/,/g, '')) || 0;
          const source = sourceIdx !== -1 && cols[sourceIdx] ? String(cols[sourceIdx]) : '';
          
          const monthlySalesList = [];
          for (let month = 1; month <= 12; month++) {
             const mIdx = headers.findIndex(h => h === `T${month}`);
             if (mIdx !== -1 && cols[mIdx] !== undefined && cols[mIdx] !== '') {
                monthlySalesList.push(parseInt(String(cols[mIdx]).replace(/,/g, '')) || 0);
             } else {
                monthlySalesList.push(0);
             }
          }
          
          const noteIdx = headers.findIndex(h => h.includes('GHI CHÚ') || h.includes('GHI CHU'));
          const note = noteIdx !== -1 && cols[noteIdx] ? String(cols[noteIdx]) : '';

          const existingIndex = updatedProducts.findIndex(p => p.sku === sku);
          
          if (existingIndex >= 0) {
            let existingProduct = { ...updatedProducts[existingIndex] };
            
            existingProduct.stock = stock;
            if (nameIdx !== -1 && cols[nameIdx]) existingProduct.name = name;
            if (sourceIdx !== -1 && cols[sourceIdx]) existingProduct.source = source;
            if (noteIdx !== -1 && cols[noteIdx]) existingProduct.note = note;
            
            const hasMonthlySales = headers.some(h => h.match(/^T\d+$/));
            if (hasMonthlySales) {
                existingProduct.monthlySales = monthlySalesList;
                existingProduct.maxSales = Math.max(...monthlySalesList);
                existingProduct.sales1M = monthlySalesList[0];
            }
            
            updatedProducts[existingIndex] = recalculateProduct(existingProduct);
            updatedCount++;
          } else {
            const maxSalesVal = Math.max(...monthlySalesList);
            const sales1MVal = monthlySalesList[0]; 

            currentMaxId++;
            const newProduct = {
              id: currentMaxId,
              sku,
              name,
              stock,
              source,
              sales1M: sales1MVal,
              monthlySales: monthlySalesList,
              maxSales: maxSalesVal,
              importQty: 0,
              status: '',
              note,
              isManual: false
            };
            updatedProducts.push(recalculateProduct(newProduct));
            addedCount++;
          }
        }
        
        if (addedCount > 0 || updatedCount > 0) {
          setTimeout(() => {
            alert(`Đã tải lên Excel thành công!\n- Thêm mới: ${addedCount} sản phẩm\n- Cập nhật tồn kho: ${updatedCount} sản phẩm`);
            setShowAddModal(false);
          }, 0);
        } else {
          setTimeout(() => alert('Không tìm thấy dữ liệu hợp lệ trong file!'), 0);
        }
        
        return updatedProducts;
      });
      
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    };
    reader.readAsArrayBuffer(file);
  };

  // Thống kê
  const stats = useMemo(() => {
    const total = products.length;
    const needImport = products.filter(p => p.status === 'Cần nhập').length;
    const soonImport = products.filter(p => p.status === 'Sắp cần nhập').length;
    const noImport = products.filter(p => p.status === 'Chưa cần nhập').length;
    const totalImportAmount = products.reduce((sum, p) => sum + p.importQty, 0);
    return { total, needImport, soonImport, noImport, totalImportAmount };
  }, [products]);

  const getStatusBadge = (status) => {
    if (status === 'Cần nhập') return <span className="badge red">{status}</span>;
    if (status === 'Sắp cần nhập') return <span className="badge yellow">{status}</span>;
    return <span className="badge green">{status}</span>;
  };

  return (
    <div className="app-container">
      {/* Sidebar */}
      <aside className="sidebar">
        <div className="sidebar-header" style={{ justifyContent: 'center', padding: '24px 16px 16px', height: 'auto', minHeight: 'var(--header-height)' }}>
          <img src={`${import.meta.env.BASE_URL}logo.png`} alt="Vận Hành Shop Logo" style={{ maxWidth: '100%', maxHeight: '110px', objectFit: 'contain' }} />
        </div>
        <div className="sidebar-menu">
          <div className={`menu-item ${activeMenu === 'tong-quan' ? 'active' : ''}`} onClick={() => setActiveMenu('tong-quan')}>
            <LayoutDashboard size={20} /> Tổng quan
          </div>
          <div className={`menu-item ${activeMenu === 'nhap-hang' ? 'active' : ''}`} onClick={() => setActiveMenu('nhap-hang')}>
            <ShoppingCart size={20} /> Nhập hàng
          </div>
          <div className={`menu-item ${activeMenu === 'san-pham' ? 'active' : ''}`} onClick={() => setActiveMenu('san-pham')}>
            <Package size={20} /> Sản phẩm
          </div>
          <div className="menu-item"><FileText size={20} /> Đơn nhập hàng</div>
          <div className={`menu-item ${activeMenu === 'nha-cung-cap' ? 'active' : ''}`} onClick={() => setActiveMenu('nha-cung-cap')}>
            <Truck size={20} /> Nhà cung cấp
          </div>
          <div className="menu-item"><Users size={20} /> Kho hàng</div>
        </div>
        <div className="sidebar-footer user-profile">
          <div className="user-avatar">
            <Users size={20} color="var(--text-secondary)" />
          </div>
          <div className="user-info">
            <div className="user-name">Admin</div>
            <div className="user-role">Quản trị viên</div>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="main-content">
        <header className="header">
          <div className="header-title">
            {activeMenu === 'nhap-hang' ? 'Nhập hàng' : 
             activeMenu === 'san-pham' ? 'Danh sách sản phẩm' : 
             activeMenu === 'nha-cung-cap' ? 'Nhà cung cấp' : 'Tổng quan'}
          </div>
          <div className="header-actions">
            <div className="icon-btn"><Bell size={20} /></div>
            <div className="icon-btn"><Settings size={20} /></div>
            <button className="btn btn-primary" onClick={() => setShowAddModal(true)}>
              <FilePlus size={16} /> Thêm sản phẩm
            </button>
          </div>
        </header>

        <div className="content-area">
          {activeMenu === 'nhap-hang' && (
            <>
              <div className="tabs-container">
            <div className={`tab ${activeTab === 'san-pham' ? 'active' : ''}`} onClick={() => setActiveTab('san-pham')}>
              1. Nhập liệu & Tính toán
            </div>
            <div className={`tab ${activeTab === 'phieu-nhap' ? 'active' : ''}`} onClick={() => setActiveTab('phieu-nhap')}>
              2. Kiểm tra & Làm phiếu nhập
            </div>
          </div>

          {activeTab === 'san-pham' && (
            <>
              <p style={{ color: 'var(--text-secondary)', marginBottom: '24px' }}>
                Danh sách sản phẩm để xuất nhập hàng dựa trên tình hình bán hàng và tồn kho.
              </p>


              {/* Table Area */}
              <div className="table-container">
                <div className="table-header-controls">
                  <input type="text" className="search-input" placeholder="Tìm kiếm SKU hoặc tên sản phẩm..." />
                  <select className="filter-select">
                    <option>Trạng thái: Tất cả</option>
                    <option>Cần nhập</option>
                    <option>Chưa cần nhập</option>
                  </select>
                  <select 
                    className="filter-select"
                    value={filterSource}
                    onChange={e => setFilterSource(e.target.value)}
                  >
                    <option value="Tất cả">Nguồn nhập: Tất cả</option>
                    {suppliers.map(s => (
                      <option key={s.id} value={s.name}>{s.name}</option>
                    ))}
                  </select>
                  <button className="btn btn-outline"><Filter size={16} /> Bộ lọc nâng cao</button>
                </div>
                <table className="table">
                  <thead>
                    <tr>
                      <th>STT</th>
                      <th>SKU</th>
                      <th>Tên sản phẩm</th>
                      <th>Tồn kho</th>
                      <th>Nguồn nhập</th>
                      <th>Số bán Max</th>
                      <th>Số cần nhập</th>
                      <th>Trạng thái</th>
                      <th>Thao tác</th>
                    </tr>
                  </thead>
                  <tbody>
                    {products.filter(p => filterSource === 'Tất cả' || p.source === filterSource).map((p, index) => (
                      <tr key={p.id}>
                        <td>{index + 1}</td>
                        <td style={{ color: 'var(--primary-color)', fontWeight: 500 }}>{p.sku}</td>
                        <td style={{ fontWeight: 500 }}>{p.name}</td>
                        <td>{p.stock}</td>
                        <td><span style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>{p.source}</span></td>
                        <td style={{ fontWeight: 500 }}>
                          <div className="input-with-warning" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            {p.maxSales}
                            {p.isManual && (
                              <AlertTriangle 
                                className="warning-icon" 
                                size={16} 
                                title="Đã được chỉnh sửa thủ công, không theo file tính toán" 
                              />
                            )}
                          </div>
                        </td>
                        <td>
                          <input 
                            type="number" 
                            className="editable-input" 
                            value={p.importQty}
                            onChange={(e) => handleImportQtyChange(p.id, e.target.value)}
                            style={{ backgroundColor: '#f8fafc' }}
                          />
                        </td>
                        <td>{getStatusBadge(p.status)}</td>
                        <td>
                          <div style={{ display: 'flex', gap: '8px' }}>
                            <button className="icon-btn" onClick={() => openEditProductModal(p)}><Edit2 size={16} /></button>
                            <button className="icon-btn danger" onClick={() => setProducts(products.filter(item => item.id !== p.id))}><Trash2 size={16} /></button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="table-footer">
                  <div style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
                    Hiển thị 1 đến {products.length} trong tổng số {stats.total} sản phẩm
                  </div>
                  <div className="total-summary">
                    Tổng lượng cần nhập: <span>{stats.totalImportAmount}</span>
                  </div>
                  <div className="pagination">
                    <button className="page-btn" disabled><ChevronLeft size={16} /></button>
                    <button className="page-btn active">1</button>
                    <button className="page-btn">2</button>
                    <button className="page-btn">3</button>
                    <button className="page-btn"><ChevronRight size={16} /></button>
                  </div>
                </div>
              </div>
            </>
          )}

          {activeTab === 'phieu-nhap' && (
            <>
              <p style={{ color: 'var(--text-secondary)', marginBottom: '24px' }}>
                Nhân viên kiểm tra danh sách các mặt hàng có số lượng cần nhập &gt; 0, chọn mặt hàng và tạo Phiếu Nhập để gửi nhà cung cấp.
              </p>

              <div className="table-container">
                <table className="table">
                  <thead>
                    <tr>
                      <th style={{ width: '40px' }}>
                        <input 
                          type="checkbox" 
                          onChange={selectAllReceipt}
                          checked={selectedForReceipt.length > 0 && selectedForReceipt.length === products.filter(p => p.importQty > 0).length}
                        />
                      </th>
                      <th>SKU</th>
                      <th>Tên sản phẩm</th>
                      <th>Nguồn nhập</th>
                      <th>Tồn hiện tại</th>
                      <th style={{ color: 'var(--primary-color)' }}>Số chốt nhập</th>
                      <th>Trạng thái</th>
                    </tr>
                  </thead>
                  <tbody>
                    {products.filter(p => p.importQty > 0 || p.status === 'Cần nhập' || p.status === 'Sắp cần nhập').map(p => (
                      <tr key={p.id}>
                        <td>
                          <input 
                            type="checkbox" 
                            checked={selectedForReceipt.includes(p.id)}
                            onChange={() => toggleSelectProduct(p.id)}
                          />
                        </td>
                        <td style={{ color: 'var(--primary-color)', fontWeight: 500 }}>{p.sku}</td>
                        <td style={{ fontWeight: 500 }}>{p.name}</td>
                        <td>{p.source}</td>
                        <td>{p.stock}</td>
                        <td>
                          <strong style={{ fontSize: '1.125rem' }}>{p.importQty}</strong>
                        </td>
                        <td>{getStatusBadge(p.status)}</td>
                      </tr>
                    ))}
                    {products.filter(p => p.importQty > 0 || p.status === 'Cần nhập' || p.status === 'Sắp cần nhập').length === 0 && (
                      <tr>
                        <td colSpan="7" style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: '32px' }}>
                          Không có sản phẩm nào cần nhập lúc này.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {selectedForReceipt.length > 0 && (
                <div className="checkout-panel">
                  <div className="checkout-info">
                    <h3>Đã chọn {selectedForReceipt.length} mặt hàng để nhập</h3>
                    <p>Tổng số lượng: {selectedForReceipt.reduce((acc, id) => acc + products.find(p => p.id === id).importQty, 0)}</p>
                  </div>
                  <div style={{ display: 'flex', gap: '16px' }}>
                    <button className="btn btn-outline">Hủy bỏ</button>
                    <button className="btn btn-primary" onClick={() => alert('Đã tạo phiếu nhập thành công!')}>
                      <FileText size={18} /> Tạo Phiếu Nhập
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
            </>
          )}

          {activeMenu === 'san-pham' && (
            <div className="table-container" style={{ overflowX: 'auto' }}>
              <div className="table-header-controls">
                <input type="text" className="search-input" placeholder="Tìm kiếm sản phẩm..." />
                <button 
                  className={`btn ${showMonths ? 'btn-outline' : 'btn-primary'}`} 
                  style={{ minWidth: '130px', justifyContent: 'center' }}
                  onClick={() => setShowMonths(!showMonths)}
                >
                  {showMonths ? 'Ẩn cột tháng' : 'Hiện cột tháng'}
                </button>
                <button className="btn btn-outline"><Filter size={16} /> Bộ lọc</button>
              </div>
              <div style={{ minWidth: '1000px' }}>
                <table className="table">
                  <thead>
                    <tr>
                      <th style={{ width: '40px' }}>STT</th>
                      <th style={{ width: '80px' }}>SKU</th>
                      <th style={{ width: '180px' }}>Tên sản phẩm</th>
                      <th style={{ width: '100px' }}>Tồn kho</th>
                      <th style={{ width: '150px' }}>Nhà cung cấp</th>
                      {showMonths && Array.from({length: 12}).map((_, i) => (
                        <th key={i} style={{ width: '55px', textAlign: 'center', padding: '12px 4px' }}>T{i+1}</th>
                      ))}
                      <th style={{ width: '80px', textAlign: 'center' }}>Max</th>
                      <th style={{ width: '150px' }}>Ghi chú</th>
                      <th style={{ width: '60px' }}>Thao tác</th>
                    </tr>
                  </thead>
                  <tbody>
                    {products.map((p, index) => (
                      <tr key={p.id}>
                        <td>{index + 1}</td>
                        <td style={{ color: 'var(--primary-color)', fontWeight: 500 }}>{p.sku}</td>
                        <td style={{ fontWeight: 500 }}>{p.name}</td>
                        <td>{p.stock}</td>
                        <td>
                          <select 
                            className="editable-input" 
                            style={{ width: '100%', padding: '4px', appearance: 'auto', background: 'transparent' }}
                            value={p.source || ''}
                            onChange={(e) => handleSourceChange(p.id, e.target.value)}
                          >
                            <option value="">-- Chọn --</option>
                            {suppliers.map(s => (
                              <option key={s.id} value={s.name}>{s.name}</option>
                            ))}
                          </select>
                        </td>
                        {showMonths && p.monthlySales.map((sale, i) => (
                          <td key={i} style={{ padding: '8px 4px' }}>
                            <input 
                              type="number" 
                              className="editable-input" 
                              style={{ width: '100%', padding: '4px', textAlign: 'center', fontSize: '0.875rem' }}
                              value={sale}
                              onChange={(e) => handleMonthlySalesChange(p.id, i, e.target.value)}
                            />
                          </td>
                        ))}
                        <td style={{ textAlign: 'center' }}>
                          <strong style={{ color: 'var(--primary-color)', fontSize: '1.125rem' }}>
                            {Math.max(...p.monthlySales)}
                          </strong>
                        </td>
                        <td>
                          <input 
                            type="text" 
                            className="editable-input" 
                            style={{ width: '100%', padding: '4px 8px' }}
                            placeholder="Thêm ghi chú..."
                            value={p.note || ''}
                            onChange={(e) => handleNoteChange(p.id, e.target.value)}
                          />
                        </td>
                        <td>
                          <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
                            <button className="icon-btn" onClick={() => openEditProductModal(p)}>
                              <Edit2 size={16} />
                            </button>
                            <button className="icon-btn danger" onClick={() => setProducts(products.filter(item => item.id !== p.id))}>
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activeMenu === 'nha-cung-cap' && (
            <div className="table-container">
              <div className="table-header-controls">
                <input type="text" className="search-input" placeholder="Tìm kiếm nhà cung cấp..." />
                <button className="btn btn-primary" onClick={() => alert('Thêm nhà cung cấp')}>Thêm NCC</button>
              </div>
              <table className="table">
                <thead>
                  <tr>
                    <th>STT</th>
                    <th>Tên nhà cung cấp</th>
                    <th>Địa chỉ</th>
                    <th>Số điện thoại</th>
                    <th>Thao tác</th>
                  </tr>
                </thead>
                <tbody>
                  {suppliers.map((s, index) => (
                    <tr key={s.id}>
                      <td>{index + 1}</td>
                      <td style={{ fontWeight: 500 }}>
                        {editingSupplierId === s.id ? (
                          <input className="editable-input" style={{ width: '100%', textAlign: 'left' }} value={s.name} onChange={(e) => handleSupplierChange(s.id, 'name', e.target.value)} />
                        ) : s.name}
                      </td>
                      <td>
                        {editingSupplierId === s.id ? (
                          <input className="editable-input" style={{ width: '100%', textAlign: 'left' }} value={s.contact} onChange={(e) => handleSupplierChange(s.id, 'contact', e.target.value)} />
                        ) : s.contact}
                      </td>
                      <td>
                        {editingSupplierId === s.id ? (
                          <input className="editable-input" style={{ width: '100%', textAlign: 'left' }} value={s.phone} onChange={(e) => handleSupplierChange(s.id, 'phone', e.target.value)} />
                        ) : s.phone}
                      </td>

                      <td>
                        <div style={{ display: 'flex', gap: '8px' }}>
                          {editingSupplierId === s.id ? (
                            <button className="icon-btn" style={{ color: 'var(--success-color)' }} onClick={() => setEditingSupplierId(null)}>
                              <Save size={16} />
                            </button>
                          ) : (
                            <button className="icon-btn" onClick={() => setEditingSupplierId(s.id)}>
                              <Edit2 size={16} />
                            </button>
                          )}
                          <button className="icon-btn danger" onClick={() => setSuppliers(suppliers.filter(item => item.id !== s.id))}>
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

        </div>
      </main>

      {/* Modal Thêm Sản Phẩm */}
      {showAddModal && (
        <div className="modal-overlay" onClick={() => setShowAddModal(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Thêm Sản Phẩm Mới</h2>
              <button className="icon-btn" onClick={() => setShowAddModal(false)}>
                <span style={{ fontSize: '1.25rem', fontWeight: 'bold' }}>&times;</span>
              </button>
            </div>
            <div className="modal-body">
              <div className="action-card">
                <div className="action-card-info">
                  <h4>Nhập hàng loạt bằng Excel</h4>
                  <p>Tải file mẫu về, điền thông tin và tải lên lại hệ thống.</p>
                </div>
                <div className="action-card-buttons">
                  <button className="btn btn-outline" onClick={handleDownloadTemplate}>Tải file mẫu</button>
                  <button className="btn btn-primary" onClick={() => fileInputRef.current && fileInputRef.current.click()}>Tải lên Excel</button>
                  <input type="file" accept=".csv, .xlsx, .xls" style={{ display: 'none' }} ref={fileInputRef} onChange={handleFileUpload} />
                </div>
              </div>
              
              <div className="modal-divider">HOẶC</div>

              <div className="action-card">
                <div className="action-card-info">
                  <h4>Thêm thủ công</h4>
                  <p>Nhập thông tin cho từng sản phẩm trực tiếp trên hệ thống.</p>
                </div>
                <button className="btn btn-outline" onClick={() => {
                  setShowAddModal(false);
                  setShowManualAddModal(true);
                }}>
                  <FilePlus size={16} style={{ marginRight: '4px' }}/> Thêm thủ công
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal Thêm Sản Phẩm Thủ Công */}
      {showManualAddModal && (
        <div className="modal-overlay" onClick={() => setShowManualAddModal(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Thêm Sản Phẩm Thủ Công</h2>
              <button className="icon-btn" onClick={() => setShowManualAddModal(false)}>
                <span style={{ fontSize: '1.25rem', fontWeight: 'bold' }}>&times;</span>
              </button>
            </div>
            <div className="modal-body">
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div>
                  <label style={{ display: 'block', marginBottom: '8px', fontWeight: 500, fontSize: '0.875rem' }}>SKU</label>
                  <input 
                    type="text" 
                    className="search-input" 
                    style={{ width: '100%', background: 'white' }} 
                    placeholder="Nhập mã sản phẩm"
                    value={newProduct.sku} 
                    onChange={e => setNewProduct({...newProduct, sku: e.target.value})} 
                  />
                </div>
                <div>
                  <label style={{ display: 'block', marginBottom: '8px', fontWeight: 500, fontSize: '0.875rem' }}>Tên sản phẩm</label>
                  <input 
                    type="text" 
                    className="search-input" 
                    style={{ width: '100%', background: 'white' }} 
                    placeholder="Nhập tên sản phẩm"
                    value={newProduct.name} 
                    onChange={e => setNewProduct({...newProduct, name: e.target.value})} 
                  />
                </div>
                <div>
                  <label style={{ display: 'block', marginBottom: '8px', fontWeight: 500, fontSize: '0.875rem' }}>Tồn kho</label>
                  <input 
                    type="number" 
                    className="search-input" 
                    style={{ width: '100%', background: 'white' }} 
                    value={newProduct.stock} 
                    onChange={e => setNewProduct({...newProduct, stock: parseInt(e.target.value) || 0})} 
                  />
                </div>
                <div>
                  <label style={{ display: 'block', marginBottom: '8px', fontWeight: 500, fontSize: '0.875rem' }}>Nguồn nhập</label>
                  <select 
                    className="search-input" 
                    style={{ width: '100%', background: 'white', appearance: 'auto' }} 
                    value={newProduct.source} 
                    onChange={e => setNewProduct({...newProduct, source: e.target.value})}
                  >
                    <option value="">-- Chọn nguồn nhập --</option>
                    {suppliers.map(s => (
                      <option key={s.id} value={s.name}>{s.name}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
            <div className="modal-header" style={{ borderTop: '1px solid var(--border-color)', borderBottom: 'none', justifyContent: 'flex-end', gap: '12px', padding: '16px 24px' }}>
              <button className="btn btn-outline" onClick={() => setShowManualAddModal(false)}>Hủy</button>
              <button className="btn btn-primary" onClick={() => {
                if (!newProduct.sku || !newProduct.name) {
                  alert('Vui lòng nhập SKU và Tên sản phẩm');
                  return;
                }
                const nextId = Math.max(0, ...products.map(p => p.id)) + 1;
                const productToAdd = {
                  ...newProduct,
                  id: nextId,
                  sales1M: 0,
                  monthlySales: Array(12).fill(0),
                  maxSales: 0,
                  importQty: 0,
                  status: 'Chưa cần nhập',
                  note: '',
                  isManual: false
                };
                setProducts([...products, productToAdd]);
                setShowManualAddModal(false);
                setNewProduct({ sku: '', name: '', stock: 0, source: suppliers.length > 0 ? suppliers[0].name : '' });
              }}>Thêm mới</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Sửa Sản Phẩm */}
      {showEditProductModal && editProduct && (
        <div className="modal-overlay" onClick={() => setShowEditProductModal(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Sửa Sản Phẩm</h2>
              <button className="icon-btn" onClick={() => setShowEditProductModal(false)}>
                <span style={{ fontSize: '1.25rem', fontWeight: 'bold' }}>&times;</span>
              </button>
            </div>
            <div className="modal-body">
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div>
                  <label style={{ display: 'block', marginBottom: '8px', fontWeight: 500, fontSize: '0.875rem' }}>SKU</label>
                  <input 
                    type="text" 
                    className="search-input" 
                    style={{ width: '100%', background: 'white' }} 
                    placeholder="Nhập mã sản phẩm"
                    value={editProduct.sku} 
                    onChange={e => setEditProduct({...editProduct, sku: e.target.value})} 
                  />
                </div>
                <div>
                  <label style={{ display: 'block', marginBottom: '8px', fontWeight: 500, fontSize: '0.875rem' }}>Tên sản phẩm</label>
                  <input 
                    type="text" 
                    className="search-input" 
                    style={{ width: '100%', background: 'white' }} 
                    placeholder="Nhập tên sản phẩm"
                    value={editProduct.name} 
                    onChange={e => setEditProduct({...editProduct, name: e.target.value})} 
                  />
                </div>
                <div>
                  <label style={{ display: 'block', marginBottom: '8px', fontWeight: 500, fontSize: '0.875rem' }}>Tồn kho</label>
                  <input 
                    type="number" 
                    className="search-input" 
                    style={{ width: '100%', background: 'white' }} 
                    value={editProduct.stock} 
                    onChange={e => setEditProduct({...editProduct, stock: parseInt(e.target.value) || 0})} 
                  />
                </div>
                <div>
                  <label style={{ display: 'block', marginBottom: '8px', fontWeight: 500, fontSize: '0.875rem' }}>Nguồn nhập</label>
                  <select 
                    className="search-input" 
                    style={{ width: '100%', background: 'white', appearance: 'auto' }} 
                    value={editProduct.source} 
                    onChange={e => setEditProduct({...editProduct, source: e.target.value})}
                  >
                    <option value="">-- Chọn nguồn nhập --</option>
                    {suppliers.map(s => (
                      <option key={s.id} value={s.name}>{s.name}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
            <div className="modal-header" style={{ borderTop: '1px solid var(--border-color)', borderBottom: 'none', justifyContent: 'flex-end', gap: '12px', padding: '16px 24px' }}>
              <button className="btn btn-outline" onClick={() => setShowEditProductModal(false)}>Hủy</button>
              <button className="btn btn-primary" onClick={() => {
                if (!editProduct.sku || !editProduct.name) {
                  alert('Vui lòng nhập SKU và Tên sản phẩm');
                  return;
                }
                setProducts(products.map(p => {
                  if (p.id === editProduct.id) {
                    let updated = { ...p, ...editProduct };
                    return recalculateProduct(updated);
                  }
                  return p;
                }));
                setShowEditProductModal(false);
              }}>Lưu thay đổi</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
