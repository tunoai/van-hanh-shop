import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import * as XLSX from 'xlsx';
import { 
  Package, ShoppingCart, AlertCircle, CheckCircle2, 
  Search, Filter, ChevronLeft, ChevronRight,
  Edit2, Trash2, Bell, Settings, LogOut,
  LayoutDashboard, Truck, Users, FileText,
  AlertTriangle, FilePlus, Save, Download, Clock, Eye, ChevronDown,
  Warehouse, UserPlus, Wallet, CalendarDays, Coins
} from 'lucide-react';
import { collection, onSnapshot, addDoc, updateDoc, deleteDoc, doc, writeBatch, setDoc } from 'firebase/firestore';
import { db } from './firebase.js';
import './index.css';

const InlineEdit = ({ value, onSave, placeholder }) => {
  const [val, setVal] = useState(value || '');
  
  useEffect(() => {
    setVal(value || '');
  }, [value]);

  return (
    <input 
      type="text" 
      className="editable-input" 
      style={{ width: '100%', padding: '4px 8px' }}
      placeholder={placeholder}
      value={val}
      onChange={e => setVal(e.target.value)}
      onBlur={() => {
        if (val !== (value || '')) onSave(val);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.target.blur();
      }}
    />
  );
};

// Ô nhập số trong bảng, chỉ ghi dữ liệu khi rời ô (blur) hoặc nhấn Enter
const NumberCell = ({ value, onSave, disabled, width = '80px' }) => {
  const [val, setVal] = useState(value ?? 0);

  useEffect(() => {
    setVal(value ?? 0);
  }, [value]);

  if (disabled) return <span style={{ color: 'var(--text-secondary)' }}>—</span>;

  return (
    <input
      type="number"
      min="0"
      className="editable-input"
      style={{ width, textAlign: 'center' }}
      value={val}
      onChange={e => setVal(e.target.value)}
      onBlur={() => {
        const num = Number(val) || 0;
        setVal(num);
        if (num !== (Number(value) || 0)) onSave(num);
      }}
      onKeyDown={e => {
        if (e.key === 'Enter') e.target.blur();
      }}
    />
  );
};

// ===== Cấu hình lương =====
const SALARY_TYPES = [
  { value: 'month', label: 'Theo tháng' },
  { value: 'day', label: 'Theo ngày công' },
  { value: 'hour', label: 'Theo giờ' }
];

const getSalaryTypeLabel = (type) =>
  (SALARY_TYPES.find(t => t.value === type) || SALARY_TYPES[0]).label;

const getRateUnit = (type) =>
  type === 'hour' ? '/giờ' : type === 'day' ? '/ngày' : '/tháng';

const formatVND = (n) => (Number(n) || 0).toLocaleString('vi-VN');

// Kỳ lương dạng YYYY-MM
const getCurrentPeriod = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

const formatPeriod = (period) => {
  const [y, m] = String(period || '').split('-');
  return y && m ? `${m}/${y}` : period;
};

// Tính lương 1 nhân viên trong 1 kỳ:
//   - Theo tháng : mức lương × ngày công / ngày công chuẩn
//   - Theo ngày  : mức lương × ngày công
//   - Theo giờ   : mức lương × số giờ làm
// Tổng lương = lương chính + phụ cấp
const calcPayroll = (emp, entry) => {
  const rate = Number(emp.salaryRate) || 0;
  const standardDays = Number(emp.standardDays) || 26;
  const workDays = Number(entry?.workDays ?? 0);
  const workHours = Number(entry?.workHours ?? 0);
  const allowance = Number(entry?.allowance ?? emp.allowance ?? 0);

  let baseSalary;
  if (emp.salaryType === 'day') baseSalary = rate * workDays;
  else if (emp.salaryType === 'hour') baseSalary = rate * workHours;
  else baseSalary = standardDays > 0 ? (rate * workDays) / standardDays : 0;

  baseSalary = Math.round(baseSalary);
  return { workDays, workHours, allowance, baseSalary, totalSalary: baseSalary + allowance };
};

const EMPTY_EMPLOYEE = {
  code: '',
  name: '',
  phone: '',
  position: 'Nhân viên kho',
  salaryType: 'month',
  salaryRate: 0,
  standardDays: 26,
  allowance: 0,
  status: 'Đang làm',
  note: ''
};

function App() {
  const [activeMenu, setActiveMenu] = useState('nhap-hang');
  const [activeTab, setActiveTab] = useState('phieu-nhap');
  const [products, setProducts] = useState([]);
  const [selectedForReceipt, setSelectedForReceipt] = useState([]);
  const [importReceipts, setImportReceipts] = useState([]);
  const [expandedReceipt, setExpandedReceipt] = useState(null);
  const [showReceiptPreview, setShowReceiptPreview] = useState(false);
  const [receiptPreviewData, setReceiptPreviewData] = useState(null);
  const [toast, setToast] = useState({ show: false, message: '', type: 'success' });
  const toastTimerRef = useRef(null);

  const showToast = useCallback((message, type = 'success') => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToast({ show: true, message, type });
    toastTimerRef.current = setTimeout(() => {
      setToast(prev => ({ ...prev, show: false }));
    }, 4000);
  }, []);
  const [suppliers, setSuppliers] = useState([]);
  const [editingSupplierId, setEditingSupplierId] = useState(null);
  const [showMonths, setShowMonths] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showManualAddModal, setShowManualAddModal] = useState(false);
  const [showEditProductModal, setShowEditProductModal] = useState(false);
  const [editProduct, setEditProduct] = useState(null);
  const [filterSource, setFilterSource] = useState('Tất cả');
  const [productFilterSource, setProductFilterSource] = useState('Tất cả');
  const [filterStatuses, setFilterStatuses] = useState([]);
  const [statusDropdownOpen, setStatusDropdownOpen] = useState(false);
  const statusDropdownRef = useRef(null);

  // Close status dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (statusDropdownRef.current && !statusDropdownRef.current.contains(event.target)) {
        setStatusDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const toggleStatusFilter = useCallback((status) => {
    setFilterStatuses(prev => {
      if (prev.includes(status)) {
        return prev.filter(s => s !== status);
      } else {
        return [...prev, status];
      }
    });
  }, []);

  const statusOptions = ['Cần nhập', 'Sắp cần nhập', 'Chưa cần nhập'];

  const getStatusFilterLabel = () => {
    if (filterStatuses.length === 0 || filterStatuses.length === 3) return 'Trạng thái: Tất cả';
    return filterStatuses.join(', ');
  };
  const [searchQuery, setSearchQuery] = useState('');
  const [supplierQuery, setSupplierQuery] = useState('');
  const [newProduct, setNewProduct] = useState({
    sku: '',
    name: '',
    stock: 0,
    source: '',
    maxSales: 0
  });

  // ===== State Nhân viên & Bảng lương =====
  const [employees, setEmployees] = useState([]);
  const [payrolls, setPayrolls] = useState([]);
  const [activeEmployeeTab, setActiveEmployeeTab] = useState('danh-sach');
  const [employeeQuery, setEmployeeQuery] = useState('');
  const [employeeFilterStatus, setEmployeeFilterStatus] = useState('Đang làm');
  const [payrollPeriod, setPayrollPeriod] = useState(getCurrentPeriod());
  const [showEmployeeModal, setShowEmployeeModal] = useState(false);
  const [editEmployee, setEditEmployee] = useState(null);

  useEffect(() => {
    const unsubProducts = onSnapshot(collection(db, 'products'), (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setProducts(data);
    });

    const unsubSuppliers = onSnapshot(collection(db, 'suppliers'), (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setSuppliers(data);
    });

    const unsubReceipts = onSnapshot(collection(db, 'importReceipts'), (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      data.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
      setImportReceipts(data);
    });

    const unsubEmployees = onSnapshot(collection(db, 'employees'), (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setEmployees(data);
    });

    const unsubPayrolls = onSnapshot(collection(db, 'payrolls'), (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setPayrolls(data);
    });

    return () => {
      unsubProducts();
      unsubReceipts();
      unsubSuppliers();
      unsubEmployees();
      unsubPayrolls();
    };
  }, []);

  const handleSupplierChange = async (id, field, value) => {
    try {
      await updateDoc(doc(db, 'suppliers', String(id)), { [field]: value });
    } catch(err) { console.error(err); }
  };

  // ===== Handlers Nhân viên =====
  const openAddEmployeeModal = () => {
    setEditEmployee({ ...EMPTY_EMPLOYEE });
    setShowEmployeeModal(true);
  };

  const openEditEmployeeModal = (emp) => {
    setEditEmployee({ ...EMPTY_EMPLOYEE, ...emp });
    setShowEmployeeModal(true);
  };

  const handleSaveEmployee = async () => {
    if (!editEmployee || !(editEmployee.name || '').trim()) {
      showToast('Vui lòng nhập họ tên nhân viên', 'error');
      return;
    }
    const { id, ...data } = editEmployee;
    const payload = {
      code: (data.code || '').trim(),
      name: (data.name || '').trim(),
      phone: (data.phone || '').trim(),
      position: (data.position || '').trim(),
      salaryType: data.salaryType || 'month',
      salaryRate: Number(data.salaryRate) || 0,
      standardDays: Number(data.standardDays) || 26,
      allowance: Number(data.allowance) || 0,
      status: data.status || 'Đang làm',
      note: data.note || ''
    };
    try {
      if (id) {
        await updateDoc(doc(db, 'employees', String(id)), payload);
        showToast(`Đã cập nhật nhân viên ${payload.name}`);
      } else {
        await addDoc(collection(db, 'employees'), payload);
        showToast(`Đã thêm nhân viên ${payload.name}`);
      }
      setShowEmployeeModal(false);
      setEditEmployee(null);
    } catch (err) {
      console.error('Lỗi lưu nhân viên:', err);
      showToast('Không thể lưu nhân viên. Vui lòng thử lại!', 'error');
    }
  };

  const handleDeleteEmployee = async (emp) => {
    if (!window.confirm(`Bạn có chắc muốn xóa nhân viên "${emp.name}"?`)) return;
    try {
      await deleteDoc(doc(db, 'employees', String(emp.id)));
      showToast(`Đã xóa nhân viên ${emp.name}`);
    } catch (err) {
      console.error('Lỗi xóa nhân viên:', err);
      showToast('Không thể xóa nhân viên. Vui lòng thử lại!', 'error');
    }
  };

  // Lưu 1 ô chấm công / phụ cấp của bảng lương kỳ hiện tại
  const handlePayrollChange = async (emp, field, value) => {
    const entry = payrolls.find(pr => pr.period === payrollPeriod && pr.employeeId === emp.id) || {};
    const merged = { ...entry, [field]: Number(value) || 0 };
    const result = calcPayroll(emp, merged);
    try {
      await setDoc(doc(db, 'payrolls', `${payrollPeriod}_${emp.id}`), {
        period: payrollPeriod,
        employeeId: emp.id,
        employeeCode: emp.code || '',
        employeeName: emp.name || '',
        position: emp.position || '',
        salaryType: emp.salaryType || 'month',
        salaryRate: Number(emp.salaryRate) || 0,
        standardDays: Number(emp.standardDays) || 26,
        workDays: result.workDays,
        workHours: result.workHours,
        allowance: result.allowance,
        baseSalary: result.baseSalary,
        totalSalary: result.totalSalary,
        updatedAt: new Date().getTime()
      }, { merge: true });
    } catch (err) {
      console.error('Lỗi lưu bảng lương:', err);
      showToast('Không thể lưu bảng lương. Vui lòng thử lại!', 'error');
    }
  };

  const filteredEmployees = useMemo(() => {
    const q = employeeQuery.trim().toLowerCase();
    return employees
      .filter(e => employeeFilterStatus === 'Tất cả' || (e.status || 'Đang làm') === employeeFilterStatus)
      .filter(e => !q
        || (e.name || '').toLowerCase().includes(q)
        || (e.code || '').toLowerCase().includes(q)
        || (e.phone || '').toLowerCase().includes(q))
      .sort((a, b) => (a.name || '').localeCompare(b.name || '', 'vi'));
  }, [employees, employeeQuery, employeeFilterStatus]);

  // Bảng lương kỳ đang chọn: chỉ tính cho nhân viên đang làm
  const payrollRows = useMemo(() => {
    const q = employeeQuery.trim().toLowerCase();
    return employees
      .filter(e => (e.status || 'Đang làm') === 'Đang làm')
      .filter(e => !q
        || (e.name || '').toLowerCase().includes(q)
        || (e.code || '').toLowerCase().includes(q))
      .sort((a, b) => (a.name || '').localeCompare(b.name || '', 'vi'))
      .map(emp => {
        const entry = payrolls.find(pr => pr.period === payrollPeriod && pr.employeeId === emp.id);
        return { emp, ...calcPayroll(emp, entry) };
      });
  }, [employees, payrolls, payrollPeriod, employeeQuery]);

  const payrollTotals = useMemo(() => payrollRows.reduce((acc, r) => ({
    base: acc.base + r.baseSalary,
    allowance: acc.allowance + r.allowance,
    total: acc.total + r.totalSalary
  }), { base: 0, allowance: 0, total: 0 }), [payrollRows]);

  const exportPayrollExcel = () => {
    if (payrollRows.length === 0) {
      showToast('Chưa có dữ liệu lương để xuất!', 'error');
      return;
    }
    const wsData = [
      [`BẢNG LƯƠNG THÁNG ${formatPeriod(payrollPeriod)}`],
      [`Xuất ngày: ${new Date().toLocaleDateString('vi-VN')}`],
      [],
      ['STT', 'Mã NV', 'Họ tên', 'Chức vụ', 'Kiểu lương', 'Mức lương', 'Ngày công', 'Giờ làm', 'Lương chính', 'Phụ cấp', 'Tổng lương']
    ];
    payrollRows.forEach((r, idx) => {
      wsData.push([
        idx + 1,
        r.emp.code || '',
        r.emp.name || '',
        r.emp.position || '',
        getSalaryTypeLabel(r.emp.salaryType),
        Number(r.emp.salaryRate) || 0,
        r.emp.salaryType === 'hour' ? '' : r.workDays,
        r.emp.salaryType === 'hour' ? r.workHours : '',
        r.baseSalary,
        r.allowance,
        r.totalSalary
      ]);
    });
    wsData.push([]);
    wsData.push(['', '', '', '', '', '', '', 'TỔNG CỘNG', payrollTotals.base, payrollTotals.allowance, payrollTotals.total]);

    const ws = XLSX.utils.aoa_to_sheet(wsData);
    ws['!cols'] = [
      { wch: 5 }, { wch: 12 }, { wch: 24 }, { wch: 18 }, { wch: 14 }, { wch: 13 },
      { wch: 10 }, { wch: 10 }, { wch: 14 }, { wch: 12 }, { wch: 14 }
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Bảng lương');
    XLSX.writeFile(wb, `Bang_luong_${payrollPeriod}.xlsx`);
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

  const handleMonthlySalesChange = async (id, monthIndex, value) => {
    const p = products.find(p => p.id === id);
    if (!p) return;
    const val = parseInt(value) || 0;
    const newMonthlySales = [...p.monthlySales];
    newMonthlySales[monthIndex] = val;
    
    const newMaxSales = Math.max(...newMonthlySales);
    let updatedFields = { monthlySales: newMonthlySales };
    
    if (!p.isManual) {
      updatedFields.maxSales = newMaxSales;
      const rec = recalculateProduct({ ...p, monthlySales: newMonthlySales, maxSales: newMaxSales });
      updatedFields.importQty = rec.importQty;
      updatedFields.status = rec.status;
    }
    
    try {
      await updateDoc(doc(db, 'products', String(id)), updatedFields);
    } catch(err) { console.error(err); }
  };

  const handleNoteChange = async (id, newNote) => {
    try {
      await updateDoc(doc(db, 'products', String(id)), { note: newNote });
    } catch(err) { console.error(err); }
  };

  const handleSourceChange = async (id, newSource) => {
    try {
      await updateDoc(doc(db, 'products', String(id)), { source: newSource });
    } catch(err) { console.error(err); }
  };

  const handleMaxSalesChange = async (id, newMaxSales) => {
    const p = products.find(p => p.id === id);
    if (!p) return;
    const val = parseInt(newMaxSales) || 0;
    const updated = recalculateProduct({ ...p, maxSales: val, isManual: true });
    try {
      await updateDoc(doc(db, 'products', String(id)), { 
        maxSales: val, 
        isManual: true, 
        importQty: updated.importQty, 
        status: updated.status 
      });
    } catch(err) { console.error(err); }
  };

  const handleImportQtyChange = async (id, newQty) => {
    const val = parseInt(newQty) || 0;
    try {
      await updateDoc(doc(db, 'products', String(id)), { importQty: val, isManual: true });
    } catch(err) { console.error(err); }
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
    const filteredTab2 = products.filter(p => (p.importQty > 0 || p.status === 'Cần nhập' || p.status === 'Sắp cần nhập') && (filterSource === 'Tất cả' || p.source === filterSource) && (filterStatuses.length === 0 || filterStatuses.includes(p.status)) && ((p.sku || '').toLowerCase().includes(searchQuery.toLowerCase()) || (p.name || '').toLowerCase().includes(searchQuery.toLowerCase())));
    if (selectedForReceipt.length === filteredTab2.length && filteredTab2.length > 0) {
      setSelectedForReceipt([]);
    } else {
      setSelectedForReceipt(filteredTab2.map(p => p.id));
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
        showToast('File không có dữ liệu hợp lệ!', 'error');
        return; 
      }
      
      const batch = writeBatch(db);
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

        const existingProduct = products.find(p => p.sku === sku);
        
        if (existingProduct) {
          let updatedFields = { stock };
          if (nameIdx !== -1 && cols[nameIdx]) updatedFields.name = name;
          if (sourceIdx !== -1 && cols[sourceIdx]) updatedFields.source = source;
          if (noteIdx !== -1 && cols[noteIdx]) updatedFields.note = note;
          
          const hasMonthlySales = headers.some(h => h.match(/^T\d+$/));
          if (hasMonthlySales) {
              updatedFields.monthlySales = monthlySalesList;
              updatedFields.maxSales = Math.max(...monthlySalesList);
              updatedFields.sales1M = monthlySalesList[0];
          }
          
          const rec = recalculateProduct({ ...existingProduct, ...updatedFields });
          updatedFields.importQty = rec.importQty;
          updatedFields.status = rec.status;
          
          batch.update(doc(db, 'products', String(existingProduct.id)), updatedFields);
          updatedCount++;
        } else {
          const maxSalesVal = Math.max(...monthlySalesList);
          const sales1MVal = monthlySalesList[0]; 

          const newProduct = {
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
          const rec = recalculateProduct(newProduct);
          batch.set(doc(collection(db, 'products')), rec);
          addedCount++;
        }
      }
      
      if (addedCount > 0 || updatedCount > 0) {
        batch.commit().then(() => {
          showToast(`Đã tải lên Excel thành công! Thêm mới: ${addedCount}, Cập nhật: ${updatedCount} sản phẩm`);
          setShowAddModal(false);
        }).catch(err => {
          console.error(err);
          showToast('Có lỗi xảy ra khi lưu dữ liệu lên Firebase!', 'error');
        });
      } else {
        showToast('Không tìm thấy dữ liệu hợp lệ trong file!', 'error');
      }
      
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const inventoryFileInputRef = React.useRef(null);

  const handleInventoryUpload = (e) => {
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
        showToast('File không có dữ liệu hợp lệ!', 'error');
        return; 
      }
      
      const batch = writeBatch(db);
      let updatedCount = 0;
      let skippedCount = 0;

      const normalizeHeader = (h) => String(h).toUpperCase().replace(/["'\r]/g, '').trim();

      const headers = rows[0].map(normalizeHeader);
      let skuIdx = headers.findIndex(h => h.includes('SKU') || h.includes('MÃ SẢN PHẨM') || h.includes('MA SAN PHAM'));
      let stockIdx = headers.findIndex(h => h.includes('TỒN KHO') || h.includes('TON KHO'));

      if (skuIdx === -1) skuIdx = 0;
      if (stockIdx === -1) stockIdx = headers.length >= 16 ? 2 : 5;

      for (let i = 1; i < rows.length; i++) {
        const cols = rows[i];
        if (!cols || cols.length === 0 || cols.every(c => c === '')) continue;
        
        const sku = String(cols[skuIdx] || '').trim();
        if (!sku) continue; 
        
        const stock = parseInt(String(cols[stockIdx]).replace(/,/g, '')) || 0;
        
        const existingProduct = products.find(p => p.sku === sku);
        
        if (existingProduct) {
          const rec = recalculateProduct({ ...existingProduct, stock });
          batch.update(doc(db, 'products', String(existingProduct.id)), {
            stock,
            importQty: rec.importQty,
            status: rec.status
          });
          updatedCount++;
        } else {
          skippedCount++;
        }
      }
      
      if (updatedCount > 0) {
        batch.commit().then(() => {
          let msg = `Đã cập nhật tồn kho cho ${updatedCount} sản phẩm!`;
          if (skippedCount > 0) {
            msg += ` (Bỏ qua ${skippedCount} SKU không có trong hệ thống)`;
          }
          showToast(msg);
          setShowAddModal(false);
        }).catch(err => {
          console.error(err);
          showToast('Có lỗi xảy ra khi lưu dữ liệu lên Firebase!', 'error');
        });
      } else {
        showToast(`Không tìm thấy Mã SKU nào trùng khớp! (${skippedCount} SKU trong file không có trong hệ thống)`, 'error');
      }
      
      if (inventoryFileInputRef.current) {
        inventoryFileInputRef.current.value = '';
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

  // Helper: tải file Excel từ dữ liệu phiếu nhập
  const downloadReceiptExcel = (receiptCode, createdDate, createdTime, items, totalQty) => {
    const wsData = [
      [`PHIẾU NHẬP HÀNG - ${receiptCode}`],
      [`Ngày tạo: ${createdDate} ${createdTime}`],
      [],
      ['STT', 'SKU', 'Tên sản phẩm', 'Nguồn nhập', 'Tồn hiện tại', 'Số lượng nhập', 'Trạng thái']
    ];
    items.forEach((p, i) => {
      wsData.push([i + 1, p.sku, p.name, p.source, p.stock, p.importQty, p.status]);
    });
    wsData.push([]);
    wsData.push(['', '', '', '', 'TỔNG CỘNG:', totalQty, '']);

    const ws = XLSX.utils.aoa_to_sheet(wsData);
    ws['!cols'] = [
      { wch: 5 }, { wch: 15 }, { wch: 30 }, { wch: 20 }, { wch: 12 }, { wch: 15 }, { wch: 15 }
    ];
    ws['!merges'] = [
      { s: { r: 0, c: 0 }, e: { r: 0, c: 6 } },
      { s: { r: 1, c: 0 }, e: { r: 1, c: 6 } }
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Phiếu nhập');
    XLSX.writeFile(wb, `${receiptCode}.xlsx`);
  };

  const modalLabelStyle = { display: 'block', marginBottom: '8px', fontWeight: 500, fontSize: '0.875rem' };
  const modalInputStyle = { width: '100%', background: 'white', paddingLeft: '12px' };

  const filteredProductsTab2 = products.filter(p => (p.importQty > 0 || p.status === 'Cần nhập' || p.status === 'Sắp cần nhập') && (filterSource === 'Tất cả' || p.source === filterSource) && (filterStatuses.length === 0 || filterStatuses.includes(p.status)) && ((p.sku || '').toLowerCase().includes(searchQuery.toLowerCase()) || (p.name || '').toLowerCase().includes(searchQuery.toLowerCase())));

  return (
    <div className="app-container">
      {/* Sidebar */}
      <aside className="sidebar">
        <div className="sidebar-header" style={{ justifyContent: 'center', padding: '24px 16px 16px', height: 'auto', minHeight: 'var(--header-height)' }}>
          <img src={`${import.meta.env.BASE_URL}logo.png`} alt="Vận Hành Shop Logo" style={{ maxWidth: '100%', maxHeight: '110px', objectFit: 'contain' }} />
        </div>
        <div className="sidebar-menu">

          <div className={`menu-item ${activeMenu === 'nhap-hang' ? 'active' : ''}`} onClick={() => setActiveMenu('nhap-hang')}>
            <ShoppingCart size={20} /> Nhập hàng
          </div>
          <div className={`menu-item ${activeMenu === 'san-pham' ? 'active' : ''}`} onClick={() => setActiveMenu('san-pham')}>
            <Package size={20} /> Sản phẩm
          </div>

          <div className={`menu-item ${activeMenu === 'nha-cung-cap' ? 'active' : ''}`} onClick={() => setActiveMenu('nha-cung-cap')}>
            <Truck size={20} /> Nhà cung cấp
          </div>
          <div className="menu-item"><Warehouse size={20} /> Kho hàng</div>
          <div className={`menu-item ${activeMenu === 'nhan-vien' ? 'active' : ''}`} onClick={() => setActiveMenu('nhan-vien')}>
            <Users size={20} /> Nhân viên
          </div>
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
             activeMenu === 'nha-cung-cap' ? 'Nhà cung cấp' :
             activeMenu === 'nhan-vien' ? 'Nhân viên' : 'Tổng quan'}
          </div>
          <div className="header-actions">
            <div className="icon-btn"><Bell size={20} /></div>
            <div className="icon-btn"><Settings size={20} /></div>
            {activeMenu === 'nhan-vien' ? (
              <button className="btn btn-primary" onClick={openAddEmployeeModal}>
                <UserPlus size={16} /> Thêm nhân viên
              </button>
            ) : (
              <button className="btn btn-primary" onClick={() => setShowAddModal(true)}>
                <FilePlus size={16} /> Thêm sản phẩm
              </button>
            )}
          </div>
        </header>

        <div className="content-area">
          {activeMenu === 'nhap-hang' && (
            <>
              <div className="tabs-container">
            <div className={`tab ${activeTab === 'phieu-nhap' ? 'active' : ''}`} onClick={() => setActiveTab('phieu-nhap')}>
              1. Kiểm tra & Làm phiếu nhập
            </div>
            <div className={`tab ${activeTab === 'lich-su' ? 'active' : ''}`} onClick={() => setActiveTab('lich-su')}>
              <Clock size={14} style={{ marginRight: '6px', verticalAlign: 'middle' }} />
              2. Lịch sử phiếu nhập
            </div>
          </div>

          {activeTab === 'phieu-nhap' && (
            <>
              <p style={{ color: 'var(--text-secondary)', marginBottom: '24px' }}>
                Nhân viên kiểm tra danh sách các mặt hàng có số lượng cần nhập &gt; 0, chọn mặt hàng và tạo Phiếu Nhập để gửi nhà cung cấp.
              </p>

              {selectedForReceipt.length > 0 && (
                <div className="checkout-panel" style={{ marginBottom: '24px' }}>
                  <div className="checkout-info">
                    <h3>Đã chọn {selectedForReceipt.length} mặt hàng để nhập</h3>
                    <p>Tổng số lượng: {selectedForReceipt.reduce((acc, id) => { const found = products.find(p => p.id === id); return acc + (found ? found.importQty : 0); }, 0)}</p>
                  </div>
                  <div style={{ display: 'flex', gap: '16px' }}>
                    <button className="btn btn-outline" onClick={() => setSelectedForReceipt([])}>Hủy bỏ</button>
                    <button className="btn btn-primary" onClick={() => {
                      const selectedProducts = selectedForReceipt.map(id => {
                        const p = products.find(prod => prod.id === id);
                        return p ? { sku: p.sku, name: p.name, source: p.source || '', stock: p.stock, importQty: p.importQty, status: p.status } : null;
                      }).filter(Boolean);
                      if (selectedProducts.length === 0) { showToast('Không có sản phẩm nào được chọn!', 'error'); return; }
                      const now = new Date();
                      const receiptCode = `PN-${now.getFullYear()}${String(now.getMonth()+1).padStart(2,'0')}${String(now.getDate()).padStart(2,'0')}-${String(now.getHours()).padStart(2,'0')}${String(now.getMinutes()).padStart(2,'0')}${String(now.getSeconds()).padStart(2,'0')}`;
                      const totalQty = selectedProducts.reduce((sum, p) => sum + p.importQty, 0);
                      setReceiptPreviewData({
                        code: receiptCode,
                        createdAt: now.getTime(),
                        createdDate: now.toLocaleDateString('vi-VN'),
                        createdTime: now.toLocaleTimeString('vi-VN'),
                        totalProducts: selectedProducts.length,
                        totalQty,
                        items: selectedProducts,
                        note: ''
                      });
                      setShowReceiptPreview(true);
                    }}>
                      <FileText size={18} /> Tạo Phiếu Nhập
                    </button>
                  </div>
                </div>
              )}

              <div className="table-container">
                <div className="table-header-controls">
                  <input type="text" className="search-input" placeholder="Tìm kiếm SKU hoặc tên sản phẩm..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
                  <div className="multi-select-dropdown" ref={statusDropdownRef}>
                    <button 
                      className="multi-select-trigger" 
                      onClick={() => setStatusDropdownOpen(!statusDropdownOpen)}
                      type="button"
                    >
                      <span className="multi-select-label">{getStatusFilterLabel()}</span>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>
                    </button>
                    {statusDropdownOpen && (
                      <div className="multi-select-menu">
                        <label className="multi-select-option" onClick={() => setFilterStatuses([])}>
                          <input type="checkbox" checked={filterStatuses.length === 0} readOnly />
                          <span>Tất cả</span>
                        </label>
                        {statusOptions.map(status => (
                          <label key={status} className="multi-select-option" onClick={(e) => { e.preventDefault(); toggleStatusFilter(status); }}>
                            <input type="checkbox" checked={filterStatuses.includes(status)} readOnly />
                            <span>{status}</span>
                          </label>
                        ))}
                      </div>
                    )}
                  </div>
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
                </div>
                <table className="table">
                  <thead>
                    <tr>
                      <th style={{ width: '40px' }}>
                        <input 
                          type="checkbox" 
                          onChange={selectAllReceipt}
                          checked={selectedForReceipt.length > 0 && selectedForReceipt.length === filteredProductsTab2.length}
                        />
                      </th>
                      <th>SKU</th>
                      <th>Tên sản phẩm</th>
                      <th>Nguồn nhập</th>
                      <th>Tồn hiện tại</th>
                      <th style={{ color: '#e67e22', fontWeight: 600 }}>Số bán MAX</th>
                      <th style={{ color: 'var(--primary-color)' }}>Số chốt nhập</th>
                      <th>Trạng thái</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredProductsTab2.map(p => (
                      <tr key={p.id} style={{ backgroundColor: p.maxSales > 100 ? '#fff7ed' : 'transparent' }}>
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
                          <strong style={{ color: '#e67e22', fontSize: '1.125rem' }}>{p.maxSales || 0}</strong>
                        </td>
                        <td>
                          <strong style={{ fontSize: '1.125rem' }}>{p.importQty}</strong>
                        </td>
                        <td>{getStatusBadge(p.status)}</td>
                      </tr>
                    ))}
                    {products.filter(p => p.importQty > 0 || p.status === 'Cần nhập' || p.status === 'Sắp cần nhập').length === 0 && (
                      <tr>
                        <td colSpan="8" style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: '32px' }}>
                          Không có sản phẩm nào cần nhập lúc này.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {activeTab === 'lich-su' && (
            <>
              <p style={{ color: 'var(--text-secondary)', marginBottom: '24px' }}>
                Danh sách các phiếu nhập đã được tạo. Bấm vào phiếu để xem chi tiết hoặc tải lại file Excel.
              </p>

              <div className="table-container">
                <table className="table">
                  <thead>
                    <tr>
                      <th style={{ width: '50px' }}></th>
                      <th>Mã phiếu</th>
                      <th>Ngày tạo</th>
                      <th>Giờ tạo</th>
                      <th>Số mặt hàng</th>
                      <th>Tổng SL nhập</th>
                      <th>Thao tác</th>
                    </tr>
                  </thead>
                  <tbody>
                    {importReceipts.length === 0 && (
                      <tr>
                        <td colSpan="7" style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: '48px' }}>
                          Chưa có phiếu nhập nào.
                        </td>
                      </tr>
                    )}
                    {importReceipts.map((receipt) => (
                      <React.Fragment key={receipt.id}>
                        <tr 
                          style={{ cursor: 'pointer' }} 
                          onClick={() => setExpandedReceipt(expandedReceipt === receipt.id ? null : receipt.id)}
                        >
                          <td>
                            <ChevronDown 
                              size={16} 
                              style={{ 
                                transition: 'transform 0.2s', 
                                transform: expandedReceipt === receipt.id ? 'rotate(180deg)' : 'rotate(0deg)',
                                color: 'var(--text-secondary)'
                              }} 
                            />
                          </td>
                          <td style={{ color: 'var(--primary-color)', fontWeight: 600 }}>{receipt.code}</td>
                          <td>{receipt.createdDate}</td>
                          <td>{receipt.createdTime}</td>
                          <td>{receipt.totalProducts} sản phẩm</td>
                          <td><strong style={{ color: 'var(--primary-color)' }}>{receipt.totalQty}</strong></td>
                          <td>
                            <div style={{ display: 'flex', gap: '8px' }}>
                              <button 
                                className="btn btn-outline" 
                                style={{ padding: '6px 12px', fontSize: '0.8rem' }}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  downloadReceiptExcel(
                                    receipt.code,
                                    receipt.createdDate,
                                    receipt.createdTime,
                                    receipt.items || [],
                                    receipt.totalQty
                                  );
                                }}
                              >
                                <Download size={14} /> Tải Excel
                              </button>
                              <button 
                                className="icon-btn danger" 
                                title="Xóa phiếu nhập"
                                onClick={async (e) => {
                                  e.stopPropagation();
                                  if (window.confirm(`Bạn có chắc muốn xóa phiếu ${receipt.code}?`)) {
                                    try { await deleteDoc(doc(db, 'importReceipts', String(receipt.id))); }
                                    catch (err) { console.error(err); }
                                  }
                                }}
                              >
                                <Trash2 size={16} />
                              </button>
                            </div>
                          </td>
                        </tr>
                        {expandedReceipt === receipt.id && (
                          <tr>
                            <td colSpan="7" style={{ padding: 0, backgroundColor: '#f8fafc' }}>
                              <div className="receipt-detail-container">
                                <table className="table receipt-detail-table">
                                  <thead>
                                    <tr>
                                      <th>STT</th>
                                      <th>SKU</th>
                                      <th>Tên sản phẩm</th>
                                      <th>Nguồn nhập</th>
                                      <th>Tồn lúc tạo</th>
                                      <th>Số lượng nhập</th>
                                      <th>Trạng thái</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {(receipt.items || []).map((item, idx) => (
                                      <tr key={idx}>
                                        <td>{idx + 1}</td>
                                        <td style={{ color: 'var(--primary-color)', fontWeight: 500 }}>{item.sku}</td>
                                        <td style={{ fontWeight: 500 }}>{item.name}</td>
                                        <td>{item.source}</td>
                                        <td>{item.stock}</td>
                                        <td><strong>{item.importQty}</strong></td>
                                        <td>{item.status === 'Cần nhập' ? <span className="badge red">{item.status}</span> : item.status === 'Sắp cần nhập' ? <span className="badge yellow">{item.status}</span> : <span className="badge green">{item.status}</span>}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
            </>
          )}

          {activeMenu === 'san-pham' && (
            <div className="table-container" style={{ overflowX: 'auto' }}>
              <div className="table-header-controls">
                <input type="text" className="search-input" placeholder="Tìm kiếm sản phẩm..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
                <select 
                  className="filter-select"
                  value={productFilterSource}
                  onChange={e => setProductFilterSource(e.target.value)}
                >
                  <option value="Tất cả">Nhà cung cấp: Tất cả</option>
                  {suppliers.map(s => (
                    <option key={s.id} value={s.name}>{s.name}</option>
                  ))}
                </select>
                <button 
                  className={`btn ${showMonths ? 'btn-outline' : 'btn-primary'}`} 
                  style={{ minWidth: '130px', justifyContent: 'center' }}
                  onClick={() => setShowMonths(!showMonths)}
                >
                  {showMonths ? 'Ẩn cột tháng' : 'Hiện cột tháng'}
                </button>
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
                    {products.filter(p => (productFilterSource === 'Tất cả' || p.source === productFilterSource) && ((p.sku || '').toLowerCase().includes(searchQuery.toLowerCase()) || (p.name || '').toLowerCase().includes(searchQuery.toLowerCase()))).map((p, index) => (
                      <tr key={p.id} style={{ backgroundColor: p.maxSales > 100 ? '#fff7ed' : 'transparent' }}>
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
                            {p.maxSales || 0}
                          </strong>
                        </td>
                        <td>
                          <InlineEdit 
                            value={p.note} 
                            placeholder="Thêm ghi chú..." 
                            onSave={(val) => handleNoteChange(p.id, val)} 
                          />
                        </td>
                        <td>
                          <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
                            <button className="icon-btn" onClick={() => openEditProductModal(p)}>
                              <Edit2 size={16} />
                            </button>
                            <button className="icon-btn danger" onClick={async () => {
                              if (window.confirm('Bạn có chắc muốn xóa sản phẩm này?')) {
                                try { await deleteDoc(doc(db, 'products', String(p.id))); } 
                                catch(err) { console.error(err); }
                              }
                            }}>
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
                <input type="text" className="search-input" placeholder="Tìm kiếm nhà cung cấp..." value={supplierQuery} onChange={e => setSupplierQuery(e.target.value)} />
                <button className="btn btn-primary" onClick={async () => {
                  try {
                    const docRef = await addDoc(collection(db, 'suppliers'), {
                      name: 'Nhà cung cấp mới',
                      contact: '',
                      phone: ''
                    });
                    setEditingSupplierId(docRef.id);
                  } catch (error) {
                    console.error("Lỗi khi thêm nhà cung cấp: ", error);
                    showToast('Không thể thêm nhà cung cấp. Vui lòng thử lại!', 'error');
                  }
                }}>Thêm NCC</button>
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
                  {suppliers.filter(s => (s.name || '').toLowerCase().includes(supplierQuery.toLowerCase())).map((s, index) => (
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
                          <button className="icon-btn danger" onClick={async () => {
                            if (window.confirm('Bạn có chắc muốn xóa nhà cung cấp này?')) {
                              try { await deleteDoc(doc(db, 'suppliers', String(s.id))); } 
                              catch(err) { console.error(err); }
                            }
                          }}>
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

          {activeMenu === 'nhan-vien' && (
            <>
              <div className="tabs-container">
                <div className={`tab ${activeEmployeeTab === 'danh-sach' ? 'active' : ''}`} onClick={() => setActiveEmployeeTab('danh-sach')}>
                  <Users size={14} style={{ marginRight: '6px', verticalAlign: 'middle' }} />
                  1. Danh sách nhân viên
                </div>
                <div className={`tab ${activeEmployeeTab === 'bang-luong' ? 'active' : ''}`} onClick={() => setActiveEmployeeTab('bang-luong')}>
                  <Wallet size={14} style={{ marginRight: '6px', verticalAlign: 'middle' }} />
                  2. Bảng lương
                </div>
              </div>

              {activeEmployeeTab === 'danh-sach' && (
                <div className="table-container">
                  <div className="table-header-controls">
                    <input
                      type="text"
                      className="search-input"
                      placeholder="Tìm theo tên, mã NV, số điện thoại..."
                      value={employeeQuery}
                      onChange={e => setEmployeeQuery(e.target.value)}
                    />
                    <select className="filter-select" value={employeeFilterStatus} onChange={e => setEmployeeFilterStatus(e.target.value)}>
                      <option value="Đang làm">Đang làm</option>
                      <option value="Nghỉ việc">Nghỉ việc</option>
                      <option value="Tất cả">Tất cả trạng thái</option>
                    </select>
                    <button className="btn btn-primary" onClick={openAddEmployeeModal}>
                      <UserPlus size={16} /> Thêm nhân viên
                    </button>
                  </div>
                  <table className="table">
                    <thead>
                      <tr>
                        <th>STT</th>
                        <th>Mã NV</th>
                        <th>Họ tên</th>
                        <th>Số điện thoại</th>
                        <th>Chức vụ</th>
                        <th>Kiểu lương</th>
                        <th>Mức lương</th>
                        <th>Phụ cấp / tháng</th>
                        <th>Trạng thái</th>
                        <th>Thao tác</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredEmployees.map((emp, index) => (
                        <tr key={emp.id}>
                          <td>{index + 1}</td>
                          <td style={{ color: 'var(--primary-color)', fontWeight: 500 }}>{emp.code || '—'}</td>
                          <td style={{ fontWeight: 500 }}>{emp.name}</td>
                          <td>{emp.phone || '—'}</td>
                          <td>{emp.position || '—'}</td>
                          <td>{getSalaryTypeLabel(emp.salaryType)}</td>
                          <td style={{ fontWeight: 500 }}>
                            {formatVND(emp.salaryRate)}
                            <span style={{ color: 'var(--text-secondary)', fontSize: '0.75rem' }}> {getRateUnit(emp.salaryType)}</span>
                          </td>
                          <td>{formatVND(emp.allowance)}</td>
                          <td>
                            <span className={`badge ${(emp.status || 'Đang làm') === 'Đang làm' ? 'green' : 'red'}`}>
                              {emp.status || 'Đang làm'}
                            </span>
                          </td>
                          <td>
                            <div style={{ display: 'flex', gap: '8px' }}>
                              <button className="icon-btn" onClick={() => openEditEmployeeModal(emp)}>
                                <Edit2 size={16} />
                              </button>
                              <button className="icon-btn danger" onClick={() => handleDeleteEmployee(emp)}>
                                <Trash2 size={16} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                      {filteredEmployees.length === 0 && (
                        <tr>
                          <td colSpan="10" style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: '32px' }}>
                            {employees.length === 0 ? 'Chưa có nhân viên nào. Bấm “Thêm nhân viên” để bắt đầu.' : 'Không tìm thấy nhân viên phù hợp bộ lọc.'}
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}

              {activeEmployeeTab === 'bang-luong' && (
                <>
                  <div className="stats-grid">
                    <div className="stat-card">
                      <div className="stat-icon blue"><Users size={24} /></div>
                      <div className="stat-info">
                        <div className="stat-value">{payrollRows.length}</div>
                        <div className="stat-label">Nhân viên tính lương</div>
                      </div>
                    </div>
                    <div className="stat-card">
                      <div className="stat-icon yellow"><Coins size={24} /></div>
                      <div className="stat-info">
                        <div className="stat-value">{formatVND(payrollTotals.base)}</div>
                        <div className="stat-label">Tổng lương chính</div>
                      </div>
                    </div>
                    <div className="stat-card">
                      <div className="stat-icon green"><Wallet size={24} /></div>
                      <div className="stat-info">
                        <div className="stat-value">{formatVND(payrollTotals.allowance)}</div>
                        <div className="stat-label">Tổng phụ cấp</div>
                      </div>
                    </div>
                    <div className="stat-card">
                      <div className="stat-icon red"><CalendarDays size={24} /></div>
                      <div className="stat-info">
                        <div className="stat-value">{formatVND(payrollTotals.total)}</div>
                        <div className="stat-label">Quỹ lương tháng {formatPeriod(payrollPeriod)}</div>
                      </div>
                    </div>
                  </div>

                  <div className="table-container">
                    <div className="table-header-controls">
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <CalendarDays size={16} color="var(--text-secondary)" />
                        <input
                          type="month"
                          className="filter-select"
                          style={{ padding: '8px 12px' }}
                          value={payrollPeriod}
                          onChange={e => setPayrollPeriod(e.target.value || getCurrentPeriod())}
                        />
                      </div>
                      <input
                        type="text"
                        className="search-input"
                        placeholder="Tìm nhân viên..."
                        value={employeeQuery}
                        onChange={e => setEmployeeQuery(e.target.value)}
                      />
                      <button className="btn btn-outline" onClick={exportPayrollExcel}>
                        <Download size={16} /> Xuất Excel
                      </button>
                    </div>
                    <table className="table">
                      <thead>
                        <tr>
                          <th>STT</th>
                          <th>Mã NV</th>
                          <th>Họ tên</th>
                          <th>Kiểu lương</th>
                          <th>Mức lương</th>
                          <th>Ngày công</th>
                          <th>Giờ làm</th>
                          <th>Lương chính</th>
                          <th>Phụ cấp</th>
                          <th style={{ color: 'var(--primary-color)' }}>Tổng lương</th>
                        </tr>
                      </thead>
                      <tbody>
                        {payrollRows.map((row, index) => (
                          <tr key={row.emp.id}>
                            <td>{index + 1}</td>
                            <td style={{ color: 'var(--primary-color)', fontWeight: 500 }}>{row.emp.code || '—'}</td>
                            <td style={{ fontWeight: 500 }}>
                              {row.emp.name}
                              <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{row.emp.position}</div>
                            </td>
                            <td>
                              {getSalaryTypeLabel(row.emp.salaryType)}
                              {row.emp.salaryType === 'month' && (
                                <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                                  Chuẩn {Number(row.emp.standardDays) || 26} ngày
                                </div>
                              )}
                            </td>
                            <td>
                              {formatVND(row.emp.salaryRate)}
                              <span style={{ color: 'var(--text-secondary)', fontSize: '0.75rem' }}> {getRateUnit(row.emp.salaryType)}</span>
                            </td>
                            <td>
                              <NumberCell
                                value={row.workDays}
                                disabled={row.emp.salaryType === 'hour'}
                                onSave={(v) => handlePayrollChange(row.emp, 'workDays', v)}
                              />
                            </td>
                            <td>
                              <NumberCell
                                value={row.workHours}
                                disabled={row.emp.salaryType !== 'hour'}
                                onSave={(v) => handlePayrollChange(row.emp, 'workHours', v)}
                              />
                            </td>
                            <td style={{ fontWeight: 500 }}>{formatVND(row.baseSalary)}</td>
                            <td>
                              <NumberCell
                                value={row.allowance}
                                width="110px"
                                onSave={(v) => handlePayrollChange(row.emp, 'allowance', v)}
                              />
                            </td>
                            <td style={{ fontWeight: 700, color: 'var(--primary-color)' }}>{formatVND(row.totalSalary)}</td>
                          </tr>
                        ))}
                        {payrollRows.length === 0 && (
                          <tr>
                            <td colSpan="10" style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: '32px' }}>
                              Chưa có nhân viên nào đang làm việc để tính lương.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                    <div style={{ padding: '12px 24px', backgroundColor: '#f8fafc', borderTop: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
                        {payrollRows.length} nhân viên — kỳ lương tháng {formatPeriod(payrollPeriod)}
                      </span>
                      <span style={{ fontWeight: 600 }}>
                        Tổng quỹ lương: <span style={{ color: 'var(--primary-color)', fontSize: '1.125rem' }}>{formatVND(payrollTotals.total)} đ</span>
                      </span>
                    </div>
                  </div>
                </>
              )}
            </>
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
                  <h4>Nhập mới / Cập nhật toàn bộ bằng Excel</h4>
                  <p>Thêm mới sản phẩm và đè toàn bộ thông tin Tên, Ghi chú, Nguồn nhập,...</p>
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
                  <h4>Chỉ cập nhật Tồn Kho</h4>
                  <p>Chỉ đọc cột Tồn kho theo Mã SKU, giữ nguyên các thông tin khác trên hệ thống.</p>
                </div>
                <div className="action-card-buttons">
                  <button className="btn btn-primary" style={{ backgroundColor: '#10b981', borderColor: '#10b981' }} onClick={() => inventoryFileInputRef.current && inventoryFileInputRef.current.click()}>Tải số tồn kho</button>
                  <input type="file" accept=".csv, .xlsx, .xls" style={{ display: 'none' }} ref={inventoryFileInputRef} onChange={handleInventoryUpload} />
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
                  <label style={{ display: 'block', marginBottom: '8px', fontWeight: 500, fontSize: '0.875rem' }}>Số lượng bán MAX</label>
                  <input 
                    type="number" 
                    className="search-input" 
                    style={{ width: '100%', background: 'white' }} 
                    value={newProduct.maxSales} 
                    onChange={e => setNewProduct({...newProduct, maxSales: parseInt(e.target.value) || 0})} 
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
              <button className="btn btn-primary" onClick={async () => {
                if (!newProduct.sku || !newProduct.name) {
                  showToast('Vui lòng nhập SKU và Tên sản phẩm', 'error');
                  return;
                }
                let productToAdd = {
                  ...newProduct,
                  sales1M: 0,
                  monthlySales: Array(12).fill(0),
                  maxSales: newProduct.maxSales || 0,
                  importQty: 0,
                  status: 'Chưa cần nhập',
                  note: '',
                  isManual: false
                };
                productToAdd = recalculateProduct(productToAdd);
                if (newProduct.maxSales > 0) {
                  productToAdd.isManual = true;
                }
                try {
                  await addDoc(collection(db, 'products'), productToAdd);
                  setShowManualAddModal(false);
                  setNewProduct({ sku: '', name: '', stock: 0, source: suppliers.length > 0 ? suppliers[0].name : '', maxSales: 0 });
                } catch(err) { console.error(err); }
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
                  <label style={{ display: 'block', marginBottom: '8px', fontWeight: 500, fontSize: '0.875rem' }}>Số lượng bán MAX</label>
                  <input 
                    type="number" 
                    className="search-input" 
                    style={{ width: '100%', background: 'white' }} 
                    value={editProduct.maxSales} 
                    onChange={e => setEditProduct({...editProduct, maxSales: parseInt(e.target.value) || 0})} 
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
              <button className="btn btn-primary" onClick={async () => {
                if (!editProduct.sku || !editProduct.name) {
                  showToast('Vui lòng nhập SKU và Tên sản phẩm', 'error');
                  return;
                }
                const p = products.find(prod => prod.id === editProduct.id);
                if (p) {
                  let updated = { ...p, ...editProduct };
                  if (editProduct.maxSales !== p.maxSales) {
                    updated.isManual = true;
                  }
                  updated = recalculateProduct(updated);
                  const { id, ...dataToUpdate } = updated;
                  try {
                    await updateDoc(doc(db, 'products', String(id)), dataToUpdate);
                  } catch(err) { console.error(err); }
                }
                setShowEditProductModal(false);
              }}>Lưu thay đổi</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Thêm / Sửa Nhân Viên */}
      {showEmployeeModal && editEmployee && (
        <div className="modal-overlay" onClick={() => setShowEmployeeModal(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{editEmployee.id ? 'Sửa Nhân Viên' : 'Thêm Nhân Viên'}</h2>
              <button className="icon-btn" onClick={() => setShowEmployeeModal(false)}>
                <span style={{ fontSize: '1.25rem', fontWeight: 'bold' }}>&times;</span>
              </button>
            </div>
            <div className="modal-body">
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div>
                  <label style={modalLabelStyle}>Mã nhân viên</label>
                  <input
                    type="text"
                    className="search-input"
                    style={modalInputStyle}
                    placeholder="VD: NV001"
                    value={editEmployee.code}
                    onChange={e => setEditEmployee({ ...editEmployee, code: e.target.value })}
                  />
                </div>
                <div>
                  <label style={modalLabelStyle}>Họ tên <span style={{ color: 'var(--danger-color)' }}>*</span></label>
                  <input
                    type="text"
                    className="search-input"
                    style={modalInputStyle}
                    placeholder="Nhập họ tên nhân viên"
                    value={editEmployee.name}
                    onChange={e => setEditEmployee({ ...editEmployee, name: e.target.value })}
                  />
                </div>
                <div>
                  <label style={modalLabelStyle}>Số điện thoại</label>
                  <input
                    type="text"
                    className="search-input"
                    style={modalInputStyle}
                    placeholder="VD: 0901234567"
                    value={editEmployee.phone}
                    onChange={e => setEditEmployee({ ...editEmployee, phone: e.target.value })}
                  />
                </div>
                <div>
                  <label style={modalLabelStyle}>Chức vụ</label>
                  <input
                    type="text"
                    className="search-input"
                    style={modalInputStyle}
                    placeholder="VD: Nhân viên kho"
                    value={editEmployee.position}
                    onChange={e => setEditEmployee({ ...editEmployee, position: e.target.value })}
                  />
                </div>
                <div>
                  <label style={modalLabelStyle}>Kiểu lương</label>
                  <select
                    className="search-input"
                    style={{ ...modalInputStyle, appearance: 'auto' }}
                    value={editEmployee.salaryType}
                    onChange={e => setEditEmployee({ ...editEmployee, salaryType: e.target.value })}
                  >
                    {SALARY_TYPES.map(t => (
                      <option key={t.value} value={t.value}>{t.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label style={modalLabelStyle}>Mức lương ({getRateUnit(editEmployee.salaryType)})</label>
                  <input
                    type="number"
                    min="0"
                    className="search-input"
                    style={modalInputStyle}
                    value={editEmployee.salaryRate}
                    onChange={e => setEditEmployee({ ...editEmployee, salaryRate: parseInt(e.target.value) || 0 })}
                  />
                </div>
                {editEmployee.salaryType === 'month' && (
                  <div>
                    <label style={modalLabelStyle}>Ngày công chuẩn / tháng</label>
                    <input
                      type="number"
                      min="1"
                      className="search-input"
                      style={modalInputStyle}
                      value={editEmployee.standardDays}
                      onChange={e => setEditEmployee({ ...editEmployee, standardDays: parseInt(e.target.value) || 0 })}
                    />
                  </div>
                )}
                <div>
                  <label style={modalLabelStyle}>Phụ cấp / tháng (đ)</label>
                  <input
                    type="number"
                    min="0"
                    className="search-input"
                    style={modalInputStyle}
                    placeholder="Ăn trưa, xăng xe..."
                    value={editEmployee.allowance}
                    onChange={e => setEditEmployee({ ...editEmployee, allowance: parseInt(e.target.value) || 0 })}
                  />
                </div>
                <div>
                  <label style={modalLabelStyle}>Trạng thái</label>
                  <select
                    className="search-input"
                    style={{ ...modalInputStyle, appearance: 'auto' }}
                    value={editEmployee.status}
                    onChange={e => setEditEmployee({ ...editEmployee, status: e.target.value })}
                  >
                    <option value="Đang làm">Đang làm</option>
                    <option value="Nghỉ việc">Nghỉ việc</option>
                  </select>
                </div>
                <div style={{ gridColumn: '1 / -1' }}>
                  <label style={modalLabelStyle}>Ghi chú</label>
                  <input
                    type="text"
                    className="search-input"
                    style={modalInputStyle}
                    placeholder="Ghi chú thêm về nhân viên"
                    value={editEmployee.note}
                    onChange={e => setEditEmployee({ ...editEmployee, note: e.target.value })}
                  />
                </div>
                <div style={{ gridColumn: '1 / -1', backgroundColor: '#f0f7ff', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', padding: '12px 16px', fontSize: '0.8125rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                  <strong style={{ color: 'var(--text-primary)' }}>Cách tính lương tháng:</strong><br />
                  {editEmployee.salaryType === 'month' && 'Lương chính = Mức lương × Ngày công thực tế ÷ Ngày công chuẩn'}
                  {editEmployee.salaryType === 'day' && 'Lương chính = Mức lương × Số ngày công trong tháng'}
                  {editEmployee.salaryType === 'hour' && 'Lương chính = Mức lương × Số giờ làm trong tháng'}
                  <br />Tổng lương = Lương chính + Phụ cấp
                </div>
              </div>
            </div>
            <div className="modal-header" style={{ borderTop: '1px solid var(--border-color)', borderBottom: 'none', justifyContent: 'flex-end', gap: '12px', padding: '16px 24px' }}>
              <button className="btn btn-outline" onClick={() => setShowEmployeeModal(false)}>Hủy</button>
              <button className="btn btn-primary" onClick={handleSaveEmployee}>
                <Save size={16} /> {editEmployee.id ? 'Lưu thay đổi' : 'Thêm mới'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Xem trước Phiếu Nhập */}
      {showReceiptPreview && receiptPreviewData && (
        <div className="modal-overlay" onClick={() => setShowReceiptPreview(false)}>
          <div className="modal-content" style={{ width: '900px', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <h2>Xem trước Phiếu Nhập</h2>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
                  {receiptPreviewData.code} — {receiptPreviewData.createdDate} {receiptPreviewData.createdTime}
                </p>
              </div>
              <button className="icon-btn" onClick={() => setShowReceiptPreview(false)}>
                <span style={{ fontSize: '1.25rem', fontWeight: 'bold' }}>&times;</span>
              </button>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: '0' }}>
              <table className="table">
                <thead>
                  <tr>
                    <th>STT</th>
                    <th>SKU</th>
                    <th>Tên sản phẩm</th>
                    <th>Nguồn nhập</th>
                    <th>Tồn hiện tại</th>
                    <th style={{ color: 'var(--primary-color)' }}>Số lượng nhập</th>
                    <th>Trạng thái</th>
                  </tr>
                </thead>
                <tbody>
                  {receiptPreviewData.items.map((item, idx) => (
                    <tr key={idx}>
                      <td>{idx + 1}</td>
                      <td style={{ color: 'var(--primary-color)', fontWeight: 500 }}>{item.sku}</td>
                      <td style={{ fontWeight: 500 }}>{item.name}</td>
                      <td>{item.source}</td>
                      <td>{item.stock}</td>
                      <td>
                        <input 
                          type="number" 
                          className="editable-input" 
                          style={{ width: '80px', backgroundColor: '#f0f7ff', borderColor: 'var(--primary-color)', fontWeight: 600, fontSize: '1rem', textAlign: 'center' }}
                          value={item.importQty}
                          onChange={(e) => {
                            const newQty = parseInt(e.target.value) || 0;
                            setReceiptPreviewData(prev => {
                              const newItems = [...prev.items];
                              newItems[idx] = { ...newItems[idx], importQty: newQty };
                              const newTotal = newItems.reduce((sum, p) => sum + p.importQty, 0);
                              return { ...prev, items: newItems, totalQty: newTotal };
                            });
                          }}
                          min="0"
                        />
                      </td>
                      <td>{getStatusBadge(item.status)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div style={{ padding: '12px 24px', backgroundColor: '#f8fafc', borderTop: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>{receiptPreviewData.totalProducts} sản phẩm</span>
                <span style={{ fontWeight: 600 }}>Tổng số lượng nhập: <span style={{ color: 'var(--primary-color)', fontSize: '1.125rem' }}>{receiptPreviewData.items.reduce((sum, p) => sum + p.importQty, 0)}</span></span>
              </div>
            </div>
            <div style={{ padding: '16px 24px', borderTop: '1px solid var(--border-color)', display: 'flex', justifyContent: 'flex-end', gap: '12px', backgroundColor: '#fafbfc' }}>
              <button className="btn btn-outline" onClick={() => setShowReceiptPreview(false)}>Đóng</button>
              <button className="btn btn-outline" onClick={() => {
                downloadReceiptExcel(
                  receiptPreviewData.code,
                  receiptPreviewData.createdDate,
                  receiptPreviewData.createdTime,
                  receiptPreviewData.items,
                  receiptPreviewData.totalQty
                );
              }}>
                <Download size={16} /> Tải Excel
              </button>
              <button className="btn btn-primary" onClick={async () => {
                const code = receiptPreviewData.code;
                try {
                  await addDoc(collection(db, 'importReceipts'), receiptPreviewData);
                  setShowReceiptPreview(false);
                  setSelectedForReceipt([]);
                  setReceiptPreviewData(null);
                  showToast(`Đã lưu phiếu nhập ${code} thành công!`);
                } catch (err) {
                  console.error('Lỗi lưu phiếu nhập:', err);
                  showToast('Lỗi khi lưu phiếu nhập vào hệ thống!', 'error');
                }
              }}>
                <Save size={16} /> Xác nhận & Lưu phiếu
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Toast Notification */}
      <div className={`toast-notification ${toast.show ? 'show' : ''} ${toast.type}`}>
        <div className="toast-icon">
          {toast.type === 'success' ? <CheckCircle2 size={20} /> : <AlertCircle size={20} />}
        </div>
        <div className="toast-content">
          <div className="toast-title">{toast.type === 'success' ? 'Thành công' : 'Lỗi'}</div>
          <div className="toast-message">{toast.message}</div>
        </div>
        <button className="toast-close" onClick={() => setToast(prev => ({ ...prev, show: false }))}>
          <span>&times;</span>
        </button>
        {toast.show && <div className="toast-progress" />}
      </div>
    </div>
  );
}

export default App;
