import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePlatform } from '../context/PlatformContext';
import { SalesInvoice, SalesInvoiceItem } from '../types';
import { cancelInvoiceRow, loadInvoicePage, loadInvoiceSummary, updateInvoiceRow } from '../services/invoiceQueryApi';
import {
  Receipt,
  Search,
  Printer,
  X,
  QrCode,
  Calendar,
  CreditCard,
  User,
  Building2,
  GitBranch,
  Plus,
  Edit,
  Trash2,
  AlertTriangle,
  CheckCircle2,
  FileText,
  Filter,
  Layers,
  Sparkles,
  RefreshCw,
  Hash,
  ShoppingBag,
  FileSpreadsheet,
  Download,
} from 'lucide-react';
import {
  ExcelDataTransferModal,
  ExcelColumnConfig,
  CellValidationError,
  ExcelValidationResult,
} from '../components/ExcelDataTransferModal';
import { invoiceExcelColumns } from './invoices/invoiceExcelColumns';

export const InvoicesView: React.FC = () => {
  const {
    t,
    formatMoney,
    invoices,
    allReceptionShifts,
    activeReceptionShift,
    tenant,
    activeBranch,
    branches,
    parties,
    products,
    paymentMethods,
    currentUser,
    language,
    createOfficialTaxInvoice,
    editSalesInvoice,
    cancelSalesInvoice,
    importSalesInvoices,
  } = usePlatform();

  // Search & Filter State
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedCustomerFilter, setSelectedCustomerFilter] = useState<string>('all');
  const [periodFilter, setPeriodFilter] = useState<'all' | 'today' | 'week' | 'month' | 'custom'>('all');
  const [dateFrom, setDateFrom] = useState<string>('');
  const [dateTo, setDateTo] = useState<string>('');
  const [sourceFilter, setSourceFilter] = useState<'all' | 'pos' | 'reception_ops' | 'manual_tax_invoice'>('all');

  // Modals State
  const [selectedInvoice, setSelectedInvoice] = useState<SalesInvoice | null>(null);
  const [showCreateModal, setShowCreateModal] = useState<boolean>(false);
  const [showExcelModal, setShowExcelModal] = useState<boolean>(false);
  const [editingInvoice, setEditingInvoice] = useState<SalesInvoice | null>(null);
  const [cancellingInvoice, setCancellingInvoice] = useState<SalesInvoice | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);







  // Edit Form State
  const [editAmount, setEditAmount] = useState<number>(0);
  const [editPaymentMethod, setEditPaymentMethod] = useState<string>('');
  const [editReason, setEditReason] = useState<string>('');

  // Cancel Form State
  const [cancelReason, setCancelReason] = useState<string>('');

  // Create Official Tax Invoice State
  const [newCustomerId, setNewCustomerId] = useState<string>('');
  const [newCustomerName, setNewCustomerName] = useState<string>('');
  const [newPaymentMethod, setNewPaymentMethod] = useState<string>(
    paymentMethods[0]?.nameAr || 'نقداً (كاش)'
  );
  const [newTaxRate, setNewTaxRate] = useState<number>(tenant?.taxRate || 0.14);
  const [newInvoiceNotes, setNewInvoiceNotes] = useState<string>('');
  const [newItems, setNewItems] = useState<
    Array<{
      productId: string;
      productNameAr: string;
      productNameEn?: string;
      quantity: number;
      unitPrice: number;
      lineTotal: number;
    }>
  >([
    {
      productId: products[0]?.id || '',
      productNameAr: products[0]?.nameAr || 'خدمة كشف واستشارة',
      productNameEn: products[0]?.nameEn || 'Consultation Service',
      quantity: 1,
      unitPrice: products[0]?.sellingPrice || 350,
      lineTotal: products[0]?.sellingPrice || 350,
    },
  ]);

  const currentBranchId = activeBranch?.id || (branches.length > 0 ? branches[0].id : 'branch-cairo');

  // ── القراءة من السيرفر (مصدر واحد) ────────────────────────────────────
  const [serverInvoices, setServerInvoices] = useState<SalesInvoice[]>([]);
  const [serverStats, setServerStats] = useState({ count: 0, net: 0, tax: 0, cancelled: 0 });
  const [serverLoading, setServerLoading] = useState(false);
  const [serverHasMore, setServerHasMore] = useState(false);
  const cursorRef = useRef<{ date: string | null; id: string | null }>({ date: null, id: null });

  const invoiceFilters = useMemo(() => {
    const todayStr = new Date().toISOString().slice(0, 10);
    const from =
      periodFilter === 'today' ? todayStr
      : periodFilter === 'week' ? new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10)
      : periodFilter === 'month' ? `${new Date().toISOString().slice(0, 7)}-01`
      : periodFilter === 'custom' ? (dateFrom || undefined)
      : undefined;
    const to = periodFilter === 'today' ? todayStr : periodFilter === 'custom' ? (dateTo || undefined) : undefined;
    return {
      search: searchQuery.trim() || undefined,
      from,
      to,
      source: sourceFilter,
      customerId: selectedCustomerFilter,
      branchId: currentBranchId,
    };
  }, [searchQuery, periodFilter, dateFrom, dateTo, sourceFilter, selectedCustomerFilter, currentBranchId]);

  const reloadInvoices = useCallback(() => {
    let cancelled = false;
    if (!tenant?.id) return () => {};
    setServerLoading(true);
    cursorRef.current = { date: null, id: null };
    Promise.all([
      loadInvoicePage({ tenantId: tenant.id, filters: invoiceFilters, limit: 100 }),
      loadInvoiceSummary({ tenantId: tenant.id, filters: invoiceFilters }),
      loadInvoiceSummary({ tenantId: tenant.id, filters: { ...invoiceFilters, status: 'Cancelled' } }),
    ]).then(([page, all, cancelledSummary]) => {
      if (cancelled) return;
      setServerInvoices(page.invoices);
      cursorRef.current = { date: page.nextAfterDate, id: page.nextAfterId };
      setServerHasMore(Boolean(page.nextAfterId));
      setServerStats({
        count: all.count,
        net: Math.max(all.netTotal - cancelledSummary.netTotal, 0),
        tax: Math.max(all.taxTotal - cancelledSummary.taxTotal, 0),
        cancelled: cancelledSummary.count,
      });
      setServerLoading(false);
    });
    return () => { cancelled = true; };
  }, [tenant?.id, invoiceFilters]);

  useEffect(() => {
    const cancel = reloadInvoices();
    return cancel;
  }, [reloadInvoices]);

  const loadMoreInvoices = useCallback(async () => {
    if (!tenant?.id || !cursorRef.current.id) return;
    setServerLoading(true);
    const page = await loadInvoicePage({
      tenantId: tenant.id,
      filters: invoiceFilters,
      limit: 100,
      afterDate: cursorRef.current.date,
      afterId: cursorRef.current.id,
    });
    cursorRef.current = { date: page.nextAfterDate, id: page.nextAfterId };
    setServerHasMore(Boolean(page.nextAfterId));
    setServerInvoices((prev) => [...prev, ...page.invoices]);
    setServerLoading(false);
  }, [tenant?.id, invoiceFilters]);
  const activeBranchObj = branches.find((b) => b.id === currentBranchId) || activeBranch;

  // Branch Customers only
  const branchCustomers = useMemo(() => {
    return parties.filter((p) => {
      const isCust = p.type === 'Customer' || p.type === 'Both';
      if (!isCust) return false;
      if (p.branchId) return p.branchId === currentBranchId;
      if (Array.isArray(p.branchIds) && p.branchIds.length > 0) return p.branchIds.includes(currentBranchId);
      return currentBranchId === (branches[0]?.id || 'branch-cairo');
    });
  }, [parties, currentBranchId, branches]);

  // Check if there is an active open shift currently for the branch
  const currentOpenShift = useMemo(() => {
    return allReceptionShifts.find(
      (s) => s.status === 'Open' && s.tenantId === tenant?.id && (!currentBranchId || s.branchId === currentBranchId)
    );
  }, [allReceptionShifts, tenant?.id, currentBranchId]);

  // Statistics — من ملخص السيرفر (مطابق للفلاتر)
  const totalNetRevenue = serverStats.net;
  const totalTaxAmount = serverStats.tax;
  const validInvoicesCount = Math.max(serverStats.count - serverStats.cancelled, 0);
  const cancelledInvoicesCount = serverStats.cancelled;

  // Handlers for Creating Official Tax Invoice
  const handleAddItemRow = () => {
    const firstProd = products[0];
    setNewItems((prev) => [
      ...prev,
      {
        productId: firstProd?.id || '',
        productNameAr: firstProd?.nameAr || 'بند مبيعات جديد',
        productNameEn: firstProd?.nameEn || 'Sales Item',
        quantity: 1,
        unitPrice: firstProd?.sellingPrice || 100,
        lineTotal: firstProd?.sellingPrice || 100,
      },
    ]);
  };

  const handleUpdateItemRow = (
    index: number,
    field: 'productId' | 'productNameAr' | 'quantity' | 'unitPrice',
    value: any
  ) => {
    setNewItems((prev) => {
      const copy = [...prev];
      const item = { ...copy[index] };
      if (field === 'productId') {
        const p = products.find((prod) => prod.id === value);
        if (p) {
          item.productId = p.id;
          item.productNameAr = p.nameAr;
          item.productNameEn = p.nameEn;
          item.unitPrice = p.sellingPrice;
          item.lineTotal = (item.quantity || 1) * p.sellingPrice;
        }
      } else if (field === 'quantity') {
        const q = Number(value) || 1;
        item.quantity = q;
        item.lineTotal = q * item.unitPrice;
      } else if (field === 'unitPrice') {
        const price = Number(value) || 0;
        item.unitPrice = price;
        item.lineTotal = (item.quantity || 1) * price;
      } else if (field === 'productNameAr') {
        item.productNameAr = value;
      }
      copy[index] = item;
      return copy;
    });
  };

  const handleRemoveItemRow = (index: number) => {
    if (newItems.length <= 1) return;
    setNewItems((prev) => prev.filter((_, idx) => idx !== index));
  };

  const calculatedSubtotal = newItems.reduce((s, it) => s + it.lineTotal, 0);
  const calculatedTax = Number((calculatedSubtotal * newTaxRate).toFixed(2));
  const calculatedNet = Number((calculatedSubtotal + calculatedTax).toFixed(2));

  const handleCreateTaxInvoiceSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setActionError(null);
    setActionSuccess(null);

    if (!newCustomerName.trim()) {
      setActionError(t('يرجى اختيار العميل أو إدخال اسمه!', 'Please provide customer name!'));
      return;
    }

    if (newItems.length === 0 || calculatedNet <= 0) {
      setActionError(t('يرجى إضافة بنود مبيعات صحيحة أكبر من صفر!', 'Please add valid items!'));
      return;
    }

    const res = createOfficialTaxInvoice({
      customerId: newCustomerId || `cust-walkin-${Date.now()}`,
      customerName: newCustomerName.trim(),
      items: newItems,
      paymentMethod: newPaymentMethod,
      taxRate: newTaxRate,
      notes: newInvoiceNotes.trim() || undefined,
    });

    if (res.success && res.invoice) {
      setActionSuccess(
        t(
          `تم إصدار الفاتورة الضريبية رقم ${res.invoice.invoiceNumber} بنجاح وإضافتها كإيراد في الشيفت المفتوح.`,
          `Tax invoice ${res.invoice.invoiceNumber} issued and added to open shift.`
        )
      );
      setShowCreateModal(false);
      reloadInvoices();
      // Reset form
      setNewCustomerId('');
      setNewCustomerName('');
      setNewInvoiceNotes('');
    } else {
      setActionError(res.error || t('فشل في إصدار الفاتورة!', 'Failed to create invoice!'));
    }
  };

  // Handlers for Editing Invoice
  const handleStartEdit = (inv: SalesInvoice) => {
    setActionError(null);
    setActionSuccess(null);
    setEditingInvoice(inv);
    setEditAmount(inv.netAmount);
    setEditPaymentMethod(inv.paymentMethod);
    setEditReason('');
  };

  const handleSaveEditInvoice = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingInvoice) return;

    if (!editReason.trim()) {
      setActionError(t('يرجى توضيح سبب التعديل (إجباري)!', 'Please specify edit reason!'));
      return;
    }

    if (editAmount <= 0) {
      setActionError(t('يجب أن تكون قيمة الفاتورة أكبر من صفر!', 'Amount must be greater than zero!'));
      return;
    }

    const res = editSalesInvoice({
      invoiceId: editingInvoice.id,
      newNetAmount: Number(editAmount),
      reason: editReason.trim(),
      newPaymentMethod: editPaymentMethod,
    });

    if (res.success) {
      setActionSuccess(t('تم تعديل الفاتورة وتطبيق الأثر في شيفت التشغيل بنجاح.', 'Invoice updated successfully.'));
      setEditingInvoice(null);
      void updateInvoiceRow({
        tenantId: tenant?.id || '', invoiceId: editingInvoice.id,
        netAmount: Number(editAmount), paymentMethod: editPaymentMethod,
        reason: editReason.trim(), expectedVersion: (editingInvoice as any).version || 1,
      }).then((dbResult) => {
        if (!dbResult.ok) setActionError(dbResult.error || 'DB update failed');
        reloadInvoices();
      });
    } else {
      setActionError(res.error || t('فشل في تعديل الفاتورة!', 'Failed to edit invoice!'));
    }
  };

  // Handlers for Cancelling / Deleting Invoice
  const handleStartCancel = (inv: SalesInvoice) => {
    setActionError(null);
    setActionSuccess(null);
    setCancellingInvoice(inv);
    setCancelReason('');
  };

  const handleConfirmCancelInvoice = (e: React.FormEvent) => {
    e.preventDefault();
    if (!cancellingInvoice) return;

    if (!cancelReason.trim()) {
      setActionError(t('يرجى توضيح سبب الإلغاء (إجباري)!', 'Please specify cancellation reason!'));
      return;
    }

    const res = cancelSalesInvoice({
      invoiceId: cancellingInvoice.id,
      reason: cancelReason.trim(),
    });

    if (res.success) {
      setActionSuccess(t('تم إلغاء الفاتورة وتسجيل أثر الإلغاء في شيفت التشغيل بنجاح.', 'Invoice cancelled successfully.'));
      setCancellingInvoice(null);
      void cancelInvoiceRow({
        tenantId: tenant?.id || '',
        invoiceId: cancellingInvoice.id,
        reason: cancelReason.trim(),
      }).then((dbResult) => {
        if (!dbResult.ok) setActionError(dbResult.error || 'DB cancel failed');
        reloadInvoices();
      });
    } else {
      setActionError(res.error || t('فشل في إلغاء الفاتورة!', 'Failed to cancel invoice!'));
    }
  };

  // Excel Import Validator & Handler for Revenues & Invoices
  const validateInvoiceRows = (rawRows: any[]): ExcelValidationResult<any> => {
    const errors: CellValidationError[] = [];
    const validRows: any[] = [];

    const allowedPaymentMethods = [
      'نقداً (كاش)',
      'فيزا / بطاقة بنكية',
      'فودافون كاش',
      'إنستاباي',
      'تحويل بنكي',
    ];

    rawRows.forEach((row, idx) => {
      const rowNum = idx + 2; // Row 1 is header

      const customerName = String(
        row['اسم العميل / المشتري'] || row['اسم العميل'] || row['العميل'] || row.customerName || ''
      ).trim();

      const patientPhone = String(
        row['رقم الهاتف'] || row['الهاتف'] || row['الموبايل'] || row.patientPhone || row.phone || ''
      ).trim();

      const dateRaw = String(
        row['تاريخ الفاتورة / الإيراد'] || row['تاريخ الفاتورة'] || row['التاريخ'] || row.date || ''
      ).trim();

      const invoiceNumRaw = String(
        row['رقم الفاتورة الدفتري / المرجعي'] || row['رقم الفاتورة'] || row.invoiceNumber || ''
      ).trim();

      const serviceName = String(
        row['الخدمة / البند المباع'] || row['الخدمة'] || row['البند'] || row.serviceName || ''
      ).trim();

      const qtyRaw = row['الكمية'] ?? row.quantity ?? 1;
      const qtyNum = Number(qtyRaw);

      const netAmountRaw =
        row['صافي القيمة (الإيراد)'] ??
        row['صافي القيمة'] ??
        row['القيمة'] ??
        row['الإيراد'] ??
        row['المبلغ'] ??
        row.netAmount;
      const netAmountNum = Number(netAmountRaw);

      const taxAmountRaw = row['ضريبة القيمة المضافة'] ?? row['الضريبة'] ?? row.taxAmount ?? 0;
      const taxAmountNum = Number(taxAmountRaw);

      const paymentMethodRaw = String(
        row['طريقة السداد'] || row['طريقة الدفع'] || row.paymentMethod || 'نقداً (كاش)'
      ).trim();

      const notes = String(
        row['ملاحظات الإيراد'] || row['ملاحظات'] || row.notes || ''
      ).trim();

      // 1. Validation for Customer Name
      if (!customerName) {
        errors.push({
          rowNumber: rowNum,
          columnKey: 'customerName',
          columnLabelAr: 'اسم العميل / المشتري',
          enteredValue: row['اسم العميل / المشتري'] || '',
          reasonAr: 'اسم العميل إلزامي في قاعدة البيانات ولا يمكن تركه فارغاً',
        });
      }

      // 2. Validation for Date
      let cleanDate = dateRaw;
      if (!cleanDate) {
        cleanDate = new Date().toISOString().split('T')[0];
      } else {
        const parsed = new Date(cleanDate);
        if (isNaN(parsed.getTime())) {
          errors.push({
            rowNumber: rowNum,
            columnKey: 'date',
            columnLabelAr: 'تاريخ الفاتورة / الإيراد',
            enteredValue: dateRaw,
            reasonAr: 'صيغة التاريخ غير صالحة. الصيغة المعتمدة بالداتا بيز هي YYYY-MM-DD (مثال: 2026-10-01)',
          });
        } else {
          cleanDate = parsed.toISOString().split('T')[0];
        }
      }

      // 3. Validation for Service Name
      if (!serviceName) {
        errors.push({
          rowNumber: rowNum,
          columnKey: 'serviceName',
          columnLabelAr: 'الخدمة / البند المباع',
          enteredValue: row['الخدمة / البند المباع'] || '',
          reasonAr: 'بيان الخدمة أو المنتج المباع إلزامي لتسجيل الإيراد بشكل سليم',
        });
      }

      // 4. Validation for Quantity
      if (isNaN(qtyNum) || qtyNum <= 0) {
        errors.push({
          rowNumber: rowNum,
          columnKey: 'quantity',
          columnLabelAr: 'الكمية',
          enteredValue: qtyRaw,
          reasonAr: 'الكمية يجب أن تكون رقماً موجباً أكبر من الصفر',
        });
      }

      // 5. Validation for Net Amount
      if (isNaN(netAmountNum) || netAmountNum <= 0) {
        errors.push({
          rowNumber: rowNum,
          columnKey: 'netAmount',
          columnLabelAr: 'صافي القيمة (الإيراد)',
          enteredValue: netAmountRaw,
          reasonAr: 'صافي قيمة الإيراد يجب أن يكون رقماً موجباً أكبر من الصفر (بالجنيه)',
        });
      }

      // 6. Validation for Tax Amount
      if (isNaN(taxAmountNum) || taxAmountNum < 0) {
        errors.push({
          rowNumber: rowNum,
          columnKey: 'taxAmount',
          columnLabelAr: 'ضريبة القيمة المضافة',
          enteredValue: taxAmountRaw,
          reasonAr: 'قيمة الضريبة يجب أن تكون رقماً 0 أو موجباً',
        });
      }

      // 7. Validation for Payment Method
      const matchedMethod = allowedPaymentMethods.find(
        (m) => m === paymentMethodRaw || paymentMethodRaw.includes(m) || m.includes(paymentMethodRaw)
      );

      validRows.push({
        customerName,
        patientPhone,
        date: cleanDate,
        invoiceNumber: invoiceNumRaw || `INV-IMP-${Date.now().toString().slice(-6)}-${idx + 1}`,
        serviceName,
        quantity: isNaN(qtyNum) ? 1 : qtyNum,
        netAmount: isNaN(netAmountNum) ? 0 : netAmountNum,
        taxAmount: isNaN(taxAmountNum) ? 0 : taxAmountNum,
        paymentMethod: matchedMethod || 'نقداً (كاش)',
        notes,
      });
    });

    return {
      totalRows: rawRows.length,
      errors,
      validRows: errors.length === 0 ? validRows : [],
    };
  };

  const handleConfirmInvoiceImport = (validRows: any[]) => {
    const branchToUse = activeBranch?.id || (branches[0]?.id || 'branch-cairo');
    const newInvoicesList: SalesInvoice[] = [];

    validRows.forEach((row, idx) => {
      const invId = `inv-imp-${Date.now()}-${idx + 1}`;
      const invNumber = row.invoiceNumber || `INV-IMP-${Date.now().toString().slice(-6)}-${idx + 1}`;
      const unitPrice = row.quantity > 0 ? Number((row.netAmount / row.quantity).toFixed(2)) : row.netAmount;

      const newInv: SalesInvoice = {
        id: invId,
        tenantId: tenant?.id || '',
        branchId: branchToUse,
        invoiceNumber: invNumber,
        customerId: `cust-imp-${Date.now()}-${idx}`,
        customerName: row.customerName,
        items: [
          {
            productId: 'srv-imported',
            productNameAr: row.serviceName,
            productNameEn: row.serviceName,
            quantity: row.quantity,
            unitPrice: unitPrice,
            discount: 0,
            tax: row.taxAmount,
            lineTotal: row.netAmount,
          },
        ],
        subtotal: row.netAmount - (row.taxAmount || 0),
        taxAmount: row.taxAmount || 0,
        discountAmount: 0,
        netAmount: row.netAmount,
        paymentMethod: row.paymentMethod,
        status: 'Posted',
        createdAt: `${row.date}T12:00:00Z`,
        cashierName: currentUser?.name || 'استيراد إكسيل',
        source: 'manual_tax_invoice',
        notes: row.notes ? `استيراد إكسيل - ${row.notes}` : 'استيراد فواتير وإيرادات سابقة من ملف إكسيل',
      };

      newInvoicesList.push(newInv);
    });

    importSalesInvoices(newInvoicesList);
    setActionSuccess(`تم استيراد وحفظ ${newInvoicesList.length} فاتورة إيراد بنجاح في قاعدة البيانات.`);
  };

  return (
    <div className="space-y-6">
      {/* Toast Alerts */}
      {actionSuccess && (
        <div className="flex items-center justify-between gap-3 p-3.5 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200 text-xs font-bold animate-fadeIn">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
            <span>{actionSuccess}</span>
          </div>
          <button onClick={() => setActionSuccess(null)} className="p-1 hover:opacity-75 cursor-pointer">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {actionError && (
        <div className="flex items-center justify-between gap-3 p-3.5 rounded-2xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-200 text-xs font-bold animate-fadeIn">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-rose-600 shrink-0" />
            <span>{actionError}</span>
          </div>
          <button onClick={() => setActionError(null)} className="p-1 hover:opacity-75 cursor-pointer">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Top Header Card */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-indigo-600 text-white shadow-md shadow-indigo-600/20">
            <Receipt className="h-6 w-6" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-base md:text-lg font-black text-slate-900 dark:text-white">
                {t('سجل فواتير المبيعات والإيرادات', 'Sales & Revenue Invoices')}
              </h1>
              <span className="rounded-md bg-violet-600 px-2.5 py-0.5 text-xs font-extrabold text-white inline-flex items-center gap-1.5 shadow-xs">
                <GitBranch className="h-3 w-3" />
                {activeBranchObj?.name || t('الفرع المفعل', 'Active Branch')}
              </span>
              {currentOpenShift ? (
                <span className="rounded-md bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 px-2 py-0.5 text-[11px] font-bold inline-flex items-center gap-1">
                  <CheckCircle2 className="h-3 w-3" />
                  {t(`شيفت مفتوح #${currentOpenShift.shiftNumber}`, `Open Shift #${currentOpenShift.shiftNumber}`)}
                </span>
              ) : (
                <span className="rounded-md bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-300 px-2 py-0.5 text-[11px] font-bold inline-flex items-center gap-1">
                  <AlertTriangle className="h-3 w-3" />
                  {t('لا يوجد شيفت مفتوح حالياً', 'No Open Shift Currently')}
                </span>
              )}
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
              {t(
                'عرض كافة فواتير الإيرادات الصادرة للفرع (نقطة البيع السريعة، حركات التشغيل، والفواتير الضريبية) مع الربط اللحظي بالشيفتات.',
                'Complete sales revenue invoices for active branch with real-time shift impact.'
              )}
            </p>
          </div>
        </div>

        {/* Action Button: Create Official Tax Invoice & Excel Transfer */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setShowExcelModal(true)}
            className="flex items-center gap-1.5 rounded-xl border border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/40 px-3.5 py-2.5 text-xs font-bold text-emerald-800 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-900/50 transition-all cursor-pointer shadow-xs"
            title={t('استيراد وتصدير بيانات الإيرادات السابقة وفحص الأخطاء', 'Import & Export Revenues Excel')}
          >
            <FileSpreadsheet className="h-4 w-4 text-emerald-600" />
            <span>{t('استيراد وتصدير الإيرادات (إكسل)', 'Revenues Excel')}</span>
          </button>

          <button
            onClick={() => {
              if (!currentOpenShift) {
                setActionError(
                  t(
                    'لا يمكن إصدار فاتورة ضريبية رسمية! يجب أن يكون هناك شيفت تشغيل مفتوح حالياً في هذا الفرع لتسجيل الإيراد.',
                    'Cannot issue tax invoice! An active open shift is required in this branch.'
                  )
                );
                return;
              }
              setActionError(null);
              setShowCreateModal(true);
            }}
            className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2.5 text-xs font-bold shadow-md shadow-indigo-600/20 transition-all cursor-pointer"
          >
            <Plus className="h-4 w-4" />
            <span>{t('إصدار فاتورة ضريبية رسمية', 'Issue Official Tax Invoice')}</span>
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-slate-900">
          <span className="text-[11px] font-semibold text-slate-400 block mb-1">
            {t('إجمالي فواتير الفرع', 'Total Invoices')}
          </span>
          <span className="text-xl font-mono font-black text-slate-900 dark:text-white">
            {validInvoicesCount} {t('فاتورة', 'inv')}
          </span>
          {cancelledInvoicesCount > 0 && (
            <span className="text-[10px] text-rose-500 font-semibold block mt-0.5">
              ({cancelledInvoicesCount} {t('فاتورة ملغاة', 'cancelled')})
            </span>
          )}
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-slate-900">
          <span className="text-[11px] font-semibold text-slate-400 block mb-1">
            {t('صافي إيرادات المبيعات', 'Net Revenue')}
          </span>
          <span className="text-xl font-mono font-black text-indigo-600 dark:text-indigo-400">
            {formatMoney(totalNetRevenue)}
          </span>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-slate-900">
          <span className="text-[11px] font-semibold text-slate-400 block mb-1">
            {t('إجمالي ضريبة ق.م', 'VAT (14%)')}
          </span>
          <span className="text-xl font-mono font-black text-emerald-600 dark:text-emerald-400">
            {formatMoney(totalTaxAmount)}
          </span>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-slate-900">
          <span className="text-[11px] font-semibold text-slate-400 block mb-1">
            {t('حالة الشيفت والترحيل', 'Shift Status')}
          </span>
          <div className="mt-1 flex items-center gap-1.5 text-xs font-bold">
            {currentOpenShift ? (
              <span className="text-emerald-600 flex items-center gap-1">
                <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse"></span>
                {t('جاهز للإضافة والتعديل', 'Ready for edits')}
              </span>
            ) : (
              <span className="text-amber-600 flex items-center gap-1">
                <AlertTriangle className="h-3.5 w-3.5" />
                {t('يتطلب فتح شيفت', 'Shift required')}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Filters Bar: Period, Customer, Source, Search */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-slate-900 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* Period Presets */}
          <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800/80 p-1 rounded-xl text-xs font-bold">
            <button
              onClick={() => setPeriodFilter('all')}
              className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                periodFilter === 'all'
                  ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
              }`}
            >
              {t('الكل', 'All Time')}
            </button>
            <button
              onClick={() => setPeriodFilter('today')}
              className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                periodFilter === 'today'
                  ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
              }`}
            >
              {t('اليوم', 'Today')}
            </button>
            <button
              onClick={() => setPeriodFilter('week')}
              className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                periodFilter === 'week'
                  ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
              }`}
            >
              {t('هذا الأسبوع', 'This Week')}
            </button>
            <button
              onClick={() => setPeriodFilter('month')}
              className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                periodFilter === 'month'
                  ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
              }`}
            >
              {t('هذا الشهر', 'This Month')}
            </button>
            <button
              onClick={() => setPeriodFilter('custom')}
              className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                periodFilter === 'custom'
                  ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
              }`}
            >
              {t('فترة مخصصة', 'Custom')}
            </button>
          </div>

          {/* Source Tabs */}
          <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800/80 p-1 rounded-xl text-xs font-bold">
            <button
              onClick={() => setSourceFilter('all')}
              className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer ${
                sourceFilter === 'all'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
              }`}
            >
              {t('كافة المصادر', 'All Sources')}
            </button>
            <button
              onClick={() => setSourceFilter('pos')}
              className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer ${
                sourceFilter === 'pos'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
              }`}
            >
              {t('نقطة البيع (POS)', 'POS')}
            </button>
            <button
              onClick={() => setSourceFilter('reception_ops')}
              className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer ${
                sourceFilter === 'reception_ops'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
              }`}
            >
              {t('شاشة التشغيل', 'Reception Ops')}
            </button>
            <button
              onClick={() => setSourceFilter('manual_tax_invoice')}
              className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer ${
                sourceFilter === 'manual_tax_invoice'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
              }`}
            >
              {t('ضريبية رسمية', 'Tax Invoices')}
            </button>
          </div>
        </div>

        {/* Custom Date Inputs if custom period */}
        {periodFilter === 'custom' && (
          <div className="flex flex-wrap items-center gap-2 p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 text-xs">
            <span className="font-bold text-slate-700 dark:text-slate-300">{t('من تاريخ:', 'From:')}</span>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2 py-1 outline-none text-slate-800 dark:text-slate-200"
            />
            <span className="font-bold text-slate-700 dark:text-slate-300">{t('إلى تاريخ:', 'To:')}</span>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2 py-1 outline-none text-slate-800 dark:text-slate-200"
            />
            {(dateFrom || dateTo) && (
              <button
                onClick={() => {
                  setDateFrom('');
                  setDateTo('');
                }}
                className="text-[11px] text-slate-400 hover:text-slate-600 underline cursor-pointer"
              >
                {t('إعادة ضبط', 'Reset')}
              </button>
            )}
          </div>
        )}

        {/* Customer Select & Free Search */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {/* Customer Dropdown */}
          <div className="sm:col-span-1">
            <select
              value={selectedCustomerFilter}
              onChange={(e) => setSelectedCustomerFilter(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700 outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 cursor-pointer"
            >
              <option value="all">{t('كافة عملاء الفرع...', 'All Branch Customers...')}</option>
              {branchCustomers.map((c) => (
                <option key={c.id} value={c.name}>
                  {c.name} {c.systemCode ? `(${c.systemCode})` : ''}
                </option>
              ))}
            </select>
          </div>

          {/* Search Box */}
          <div className="sm:col-span-2 relative">
            <Search className="absolute start-3 top-2.5 h-4 w-4 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t('ابحث برقم الفاتورة، اسم العميل، البند، أو الكاشير...', 'Search invoices...')}
              className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2 ps-9 pe-8 text-xs font-medium outline-none focus:border-indigo-500 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute end-2.5 top-2.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Invoices Table */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-slate-900 overflow-hidden">
        {serverStats.count === 0 && !serverLoading ? (
          <div className="text-center py-16 text-slate-400">
            <Receipt className="h-12 w-12 mx-auto mb-2 text-slate-300 dark:text-slate-600 stroke-1" />
            <p className="text-xs font-bold text-slate-700 dark:text-slate-300">
              {t('لا توجد فواتير مبيعات مسجلة في هذا النطاق', 'No invoices found')}
            </p>
            <p className="text-[11px] text-slate-400 mt-1 max-w-md mx-auto">
              {t(
                `لم يتم تسجيل أي فواتير إيرادات تطابق معايير البحث في فرع (${activeBranchObj?.name}). يمكنك إصدار فاتورة جديدة أو مراجعة المعايير.`,
                'No revenue invoices matching search criteria.'
              )}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-slate-200 text-slate-400 dark:border-slate-800 text-start">
                  <th className="pb-3 font-bold text-start">{t('رقم الفاتورة والمصدر', 'Invoice & Source')}</th>
                  <th className="pb-3 font-bold text-start">{t('التاريخ والوقت', 'Date')}</th>
                  <th className="pb-3 font-bold text-start">{t('العميل / المريض', 'Customer / Patient')}</th>
                  <th className="pb-3 font-bold text-start">{t('البيان / الأصناف', 'Items / Services')}</th>
                  <th className="pb-3 font-bold text-start">{t('الشيفت', 'Shift')}</th>
                  <th className="pb-3 font-bold text-start">{t('طريقة السداد', 'Payment')}</th>
                  <th className="pb-3 font-bold text-end">{t('صافي الإيراد', 'Net Revenue')}</th>
                  <th className="pb-3 font-bold text-center">{t('الحالة', 'Status')}</th>
                  <th className="pb-3 font-bold text-center">{t('الإجراءات', 'Actions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-medium">
                {serverInvoices.map((inv) => {
                  const isCancelled = inv.status === 'Cancelled' || inv.status === 'Refunded';

                  // Source badge styling
                  let sourceBadge = (
                    <span className="rounded px-1.5 py-0.5 text-[9px] font-bold bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                      {t('عام', 'General')}
                    </span>
                  );
                  if (inv.source === 'pos') {
                    sourceBadge = (
                      <span className="rounded px-1.5 py-0.5 text-[9px] font-bold bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
                        {t('نقطة بيع POS', 'POS')}
                      </span>
                    );
                  } else if (inv.source === 'reception_ops') {
                    sourceBadge = (
                      <span className="rounded px-1.5 py-0.5 text-[9px] font-bold bg-purple-50 text-purple-700 dark:bg-purple-950/40 dark:text-purple-300 border border-purple-200 dark:border-purple-800">
                        {t('حركة تشغيل', 'Reception')}
                      </span>
                    );
                  } else if (inv.source === 'manual_tax_invoice') {
                    sourceBadge = (
                      <span className="rounded px-1.5 py-0.5 text-[9px] font-bold bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                        {t('فاتورة ضريبية رسمية', 'Tax Invoice')}
                      </span>
                    );
                  }

                  const firstItemName = inv.items && inv.items.length > 0 ? inv.items[0].productNameAr : inv.notes || 'إيراد خدمات';

                  return (
                    <tr
                      key={inv.id}
                      className={`hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors ${
                        isCancelled ? 'opacity-60 bg-slate-50/40 dark:bg-slate-900/40' : ''
                      }`}
                    >
                      {/* Invoice # & Source */}
                      <td className="py-3">
                        <div className="font-mono font-black text-indigo-600 dark:text-indigo-400 text-xs">
                          {inv.invoiceNumber}
                        </div>
                        <div className="mt-0.5">{sourceBadge}</div>
                      </td>

                      {/* Date & Time */}
                      <td className="py-3 text-slate-500 font-mono text-[11px] whitespace-nowrap">
                        {new Date(inv.createdAt).toLocaleString(language === 'ar' ? 'ar-EG' : 'en-US', {
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </td>

                      {/* Customer */}
                      <td className="py-3">
                        <div className="font-bold text-slate-900 dark:text-white">{inv.customerName}</div>
                        <div className="text-[10px] text-slate-400">
                          {inv.cashierName && `${t('بواسطة:', 'By:')} ${inv.cashierName}`}
                        </div>
                      </td>

                      {/* Items / Description */}
                      <td className="py-3 max-w-[200px]">
                        <div className="truncate font-semibold text-slate-800 dark:text-slate-200 text-xs" title={firstItemName}>
                          {firstItemName}
                          {inv.items && inv.items.length > 1 && ` (+${inv.items.length - 1})`}
                        </div>
                        {inv.notes && (
                          <div className="truncate text-[10px] text-slate-400" title={inv.notes}>
                            {inv.notes}
                          </div>
                        )}
                      </td>

                      {/* Shift Number */}
                      <td className="py-3 font-mono text-[11px] text-slate-500 whitespace-nowrap">
                        {inv.sourceShiftNumber ? `#${inv.sourceShiftNumber}` : '—'}
                      </td>

                      {/* Payment Method */}
                      <td className="py-3">
                        <span className="rounded px-2 py-0.5 text-[10px] font-bold bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                          {inv.paymentMethod}
                        </span>
                      </td>

                      {/* Net Amount */}
                      <td className="py-3 text-end font-mono font-black text-slate-900 dark:text-white">
                        <span className={isCancelled ? 'line-through text-slate-400' : 'text-slate-900 dark:text-white'}>
                          {formatMoney(inv.netAmount)}
                        </span>
                        {inv.taxAmount > 0 && (
                          <div className="text-[9px] text-slate-400 font-normal">
                            +{formatMoney(inv.taxAmount)} {t('ضريبة', 'VAT')}
                          </div>
                        )}
                      </td>

                      {/* Status */}
                      <td className="py-3 text-center">
                        {isCancelled ? (
                          <span className="rounded-full bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300 px-2 py-0.5 text-[10px] font-bold border border-rose-200 dark:border-rose-800">
                            {t('ملغية / مستردة', 'Cancelled')}
                          </span>
                        ) : (
                          <span className="rounded-full bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 px-2 py-0.5 text-[10px] font-bold border border-emerald-200 dark:border-emerald-800">
                            {t('معتمدة', 'Posted')}
                          </span>
                        )}
                      </td>

                      {/* Actions: View, Edit, Cancel */}
                      <td className="py-3 text-center whitespace-nowrap">
                        <div className="inline-flex items-center gap-1.5">
                          {/* View Button */}
                          <button
                            onClick={() => setSelectedInvoice(inv)}
                            title={t('معاينة وطباعة الفاتورة', 'View & Print Invoice')}
                            className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 transition-colors cursor-pointer"
                          >
                            <Printer className="h-3.5 w-3.5 text-indigo-600 dark:text-indigo-400" />
                          </button>

                          {/* Edit Button */}
                          {!isCancelled && (
                            <button
                              onClick={() => handleStartEdit(inv)}
                              title={t('تعديل الفاتورة وتأثيرها على الشيفت', 'Edit Invoice')}
                              className="p-1.5 rounded-lg border border-slate-200 hover:bg-amber-50 dark:border-slate-700 dark:hover:bg-amber-950/40 text-amber-600 dark:text-amber-400 transition-colors cursor-pointer"
                            >
                              <Edit className="h-3.5 w-3.5" />
                            </button>
                          )}

                          {/* Cancel Button */}
                          {!isCancelled && (
                            <button
                              onClick={() => handleStartCancel(inv)}
                              title={t('إلغاء وحذف الفاتورة وتسجيل الأثر بالشيفت', 'Cancel / Delete Invoice')}
                              className="p-1.5 rounded-lg border border-slate-200 hover:bg-rose-50 dark:border-slate-700 dark:hover:bg-rose-950/40 text-rose-600 dark:text-rose-400 transition-colors cursor-pointer"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <div className="mt-3 flex items-center justify-between text-[10px] text-slate-500 dark:text-slate-400">
          <span>{t(`عُرض ${serverInvoices.length} من ${serverStats.count}`, `Showing ${serverInvoices.length} of ${serverStats.count}`)}{serverLoading ? t(' — جارٍ التحميل…', ' — loading…') : ''}</span>
          <button
            type="button"
            onClick={() => void loadMoreInvoices()}
            disabled={!serverHasMore || serverLoading}
            className="rounded-xl bg-indigo-600 px-3 py-1.5 font-bold text-white hover:bg-indigo-700 disabled:opacity-40"
          >
            {serverHasMore ? t('تحميل المزيد', 'Load more') : t('وصلت للنهاية', 'End reached')}
          </button>
        </div>
      </div>

      {/* MODAL 1: CREATE OFFICIAL TAX INVOICE */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-xs overflow-y-auto">
          <div className="w-full max-w-2xl rounded-2xl bg-white p-6 shadow-2xl dark:bg-slate-900 border border-slate-100 dark:border-slate-800 my-8">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800 mb-4">
              <div className="flex items-center gap-2">
                <Receipt className="h-5 w-5 text-indigo-600" />
                <h3 className="text-base font-extrabold text-slate-900 dark:text-white">
                  {t('إصدار فاتورة ضريبية رسمية للفرع', 'Issue Official Tax Invoice')}
                </h3>
              </div>
              <button
                onClick={() => setShowCreateModal(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-white cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Shift Notice */}
            {currentOpenShift ? (
              <div className="mb-4 p-3 rounded-xl bg-indigo-50/60 dark:bg-indigo-950/30 border border-indigo-200 dark:border-indigo-800/60 text-xs text-indigo-900 dark:text-indigo-200 flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-indigo-600 shrink-0" />
                <span>
                  {t(
                    `سيتم إدراج هذه الفاتورة تلقائياً كسطر منفصل كإيراد في الشيفت المفتوح حالياً للفرع رقم (${currentOpenShift.shiftNumber}).`,
                    `Invoice will automatically be added as a separate revenue line in open shift #${currentOpenShift.shiftNumber}.`
                  )}
                </span>
              </div>
            ) : (
              <div className="mb-4 p-3 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 text-xs text-amber-800 dark:text-amber-200 flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
                <span>{t('تنبيه: يجب وجود شيفت تشغيل مفتوح حالياً لتسجيل الإيراد!', 'An open shift is mandatory!')}</span>
              </div>
            )}

            <form onSubmit={handleCreateTaxInvoiceSubmit} className="space-y-4 text-xs">
              {/* Customer Select & Input */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                    <span className="text-rose-500 font-bold ml-1">*</span>
                    {t('اختيار العميل / المريض من السجل', 'Select Client')}
                  </label>
                  <select
                    value={newCustomerId}
                    onChange={(e) => {
                      const id = e.target.value;
                      setNewCustomerId(id);
                      const c = parties.find((p) => p.id === id);
                      if (c) setNewCustomerName(c.name);
                    }}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 p-2.5 outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                  >
                    <option value="">{t('اختر عميلاً من عملاء هذا الفرع...', 'Select registered client...')}</option>
                    {branchCustomers.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} {c.systemCode ? `(${c.systemCode})` : ''}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                    <span className="text-rose-500 font-bold ml-1">*</span>
                    {t('اسم العميل في الفاتورة', 'Invoice Customer Name')}
                  </label>
                  <input
                    type="text"
                    required
                    value={newCustomerName}
                    onChange={(e) => setNewCustomerName(e.target.value)}
                    placeholder="اسم العميل أو الجهة..."
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 p-2.5 outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white font-semibold"
                  />
                </div>
              </div>

              {/* Items Section */}
              <div className="space-y-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                <div className="flex items-center justify-between">
                  <label className="font-bold text-slate-700 dark:text-slate-300">
                    {t('بنود وأصناف وخدمات الفاتورة', 'Invoice Items & Services')}
                  </label>
                  <button
                    type="button"
                    onClick={handleAddItemRow}
                    className="inline-flex items-center gap-1 text-[11px] font-bold text-indigo-600 hover:text-indigo-700 cursor-pointer"
                  >
                    <Plus className="h-3 w-3" />
                    <span>{t('إضافة بند جديد', 'Add Item')}</span>
                  </button>
                </div>

                <div className="space-y-2 max-h-48 overflow-y-auto p-1">
                  {newItems.map((item, idx) => (
                    <div
                      key={idx}
                      className="grid grid-cols-12 gap-2 p-2 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 items-center"
                    >
                      <div className="col-span-5">
                        <select
                          value={item.productId}
                          onChange={(e) => handleUpdateItemRow(idx, 'productId', e.target.value)}
                          className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-1.5 text-xs outline-none"
                        >
                          <option value="">{t('اختر صنفاً أو خدمة...', 'Select product...')}</option>
                          {products.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.nameAr} ({formatMoney(p.sellingPrice)})
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="col-span-2">
                        <input
                          type="number"
                          min="1"
                          value={item.quantity}
                          onChange={(e) => handleUpdateItemRow(idx, 'quantity', e.target.value)}
                          placeholder="الكمية"
                          className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-1.5 text-xs text-center font-mono outline-none"
                        />
                      </div>

                      <div className="col-span-2">
                        <input
                          type="number"
                          step="0.01"
                          value={item.unitPrice}
                          onChange={(e) => handleUpdateItemRow(idx, 'unitPrice', e.target.value)}
                          placeholder="السعر"
                          className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-1.5 text-xs text-end font-mono outline-none"
                        />
                      </div>

                      <div className="col-span-2 text-end font-mono font-bold text-slate-800 dark:text-slate-200">
                        {formatMoney(item.lineTotal)}
                      </div>

                      <div className="col-span-1 text-center">
                        {newItems.length > 1 && (
                          <button
                            type="button"
                            onClick={() => handleRemoveItemRow(idx)}
                            className="text-slate-400 hover:text-rose-600 cursor-pointer"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Payment Method & Tax Rate */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-slate-100 dark:border-slate-800">
                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                    {t('طريقة السداد', 'Payment Method')}
                  </label>
                  <select
                    value={newPaymentMethod}
                    onChange={(e) => setNewPaymentMethod(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 p-2.5 outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                  >
                    {paymentMethods.map((pm) => (
                      <option key={pm.id} value={pm.nameAr}>
                        {pm.nameAr}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                    {t('نسبة ضريبة القيمة المضافة', 'VAT Rate')}
                  </label>
                  <select
                    value={newTaxRate}
                    onChange={(e) => setNewTaxRate(Number(e.target.value))}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 p-2.5 outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                  >
                    <option value={0.14}>{t('14% (الضريبة العامة المعتمدة)', '14% VAT')}</option>
                    <option value={0}>{t('0% (معفاة / بدون ضريبة)', '0% Exempt')}</option>
                    <option value={0.05}>{t('5% (ضريبة مخفضة)', '5% Reduced')}</option>
                  </select>
                </div>
              </div>

              {/* Notes */}
              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                  {t('ملاحظات الفاتورة', 'Invoice Notes')}
                </label>
                <input
                  type="text"
                  value={newInvoiceNotes}
                  onChange={(e) => setNewInvoiceNotes(e.target.value)}
                  placeholder={t('ملاحظات إضافية على الفاتورة...', 'Optional notes...')}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 p-2.5 outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                />
              </div>

              {/* Totals Summary */}
              <div className="rounded-xl bg-slate-50 dark:bg-slate-800/80 p-3 space-y-1.5 border border-slate-200 dark:border-slate-700 font-mono text-xs">
                <div className="flex justify-between">
                  <span className="text-slate-500">{t('المجموع قبل الضريبة:', 'Subtotal:')}</span>
                  <span className="font-bold">{formatMoney(calculatedSubtotal)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">{t('ضريبة القيمة المضافة:', 'VAT Amount:')}</span>
                  <span className="font-bold text-emerald-600">{formatMoney(calculatedTax)}</span>
                </div>
                <div className="flex justify-between text-sm font-black pt-1.5 border-t border-slate-200 dark:border-slate-700 text-indigo-600 dark:text-indigo-400">
                  <span>{t('الصافي الإجمالي المطلوب:', 'Net Total:')}</span>
                  <span>{formatMoney(calculatedNet)}</span>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                >
                  {t('إلغاء', 'Cancel')}
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold shadow-md shadow-indigo-600/20 cursor-pointer"
                >
                  {t('اعتماد وإصدار الفاتورة وتثبيت الإيراد', 'Issue & Register Revenue')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: EDIT SALES INVOICE */}
      {editingInvoice && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl dark:bg-slate-900 border border-slate-100 dark:border-slate-800">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800 mb-4">
              <div className="flex items-center gap-2">
                <Edit className="h-5 w-5 text-amber-600" />
                <h3 className="text-base font-extrabold text-slate-900 dark:text-white">
                  {t('تعديل فاتورة مبيعات', 'Edit Sales Invoice')}
                </h3>
              </div>
              <button
                onClick={() => setEditingInvoice(null)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-white cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Operational Shift Rule Banner */}
            <div className="mb-4 p-3 rounded-xl bg-amber-50/70 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-[11px] text-amber-900 dark:text-amber-200 leading-relaxed">
              <p className="font-bold flex items-center gap-1.5 mb-1">
                <AlertTriangle className="h-3.5 w-3.5 text-amber-600 shrink-0" />
                <span>{t('قاعدة التأثير على شيفت التشغيل:', 'Shift Impact Rule:')}</span>
              </p>
              {editingInvoice.sourceShiftId &&
              allReceptionShifts.find((s) => s.id === editingInvoice.sourceShiftId)?.status === 'Open' ? (
                <span>
                  {t(
                    'الشيفت الصادر منه الفاتورة ما زال مفتوحاً؛ سيتم تعديل قيمة الفاتورة والإيراد مباشرة في نفس الشيفت.',
                    'Source shift is currently open; invoice revenue will be updated directly in it.'
                  )}
                </span>
              ) : (
                <span>
                  {t(
                    'الشيفت الصادر منه الفاتورة مغلق؛ سيظهر أثر التعديل (فرق الإيراد) في سطر منفصل مستقل في الشيفت الحالي المفتوح للفرع.',
                    'Source shift is closed; revenue difference will appear as a separate line in the current open shift.'
                  )}
                </span>
              )}
            </div>

            <form onSubmit={handleSaveEditInvoice} className="space-y-3.5 text-xs">
              <div>
                <label className="block text-slate-500 mb-1">{t('رقم الفاتورة:', 'Invoice #:')}</label>
                <input
                  type="text"
                  disabled
                  readOnly
                  value={editingInvoice.invoiceNumber}
                  className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 p-2 font-mono font-bold text-slate-700 dark:text-slate-300"
                />
              </div>

              <div>
                <label className="block text-slate-500 mb-1">{t('العميل / المريض:', 'Customer:')}</label>
                <input
                  type="text"
                  disabled
                  readOnly
                  value={editingInvoice.customerName}
                  className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 p-2 font-bold text-slate-700 dark:text-slate-300"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-slate-500 mb-1">{t('القيمة الحالية:', 'Current Amount:')}</label>
                  <input
                    type="text"
                    disabled
                    readOnly
                    value={formatMoney(editingInvoice.netAmount)}
                    className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 p-2 font-mono font-bold text-slate-500"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                    <span className="text-rose-500 font-bold ml-1">*</span>
                    {t('القيمة المعدلة الجديدة:', 'New Amount:')}
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={editAmount}
                    onChange={(e) => setEditAmount(Number(e.target.value))}
                    className="w-full rounded-xl border border-amber-300 dark:border-amber-700 bg-white dark:bg-slate-800 p-2 font-mono font-extrabold text-amber-700 dark:text-amber-400 outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                  {t('طريقة السداد:', 'Payment Method:')}
                </label>
                <select
                  value={editPaymentMethod}
                  onChange={(e) => setEditPaymentMethod(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 p-2 outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white font-medium"
                >
                  {paymentMethods.map((pm) => (
                    <option key={pm.id} value={pm.nameAr}>
                      {pm.nameAr}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                  <span className="text-rose-500 font-bold ml-1">*</span>
                  {t('سبب التعديل (إجباري):', 'Reason for Edit (Mandatory):')}
                </label>
                <textarea
                  required
                  rows={2}
                  value={editReason}
                  onChange={(e) => setEditReason(e.target.value)}
                  placeholder={t('اكتب سبب تعديل قيمة الفاتورة...', 'Reason for adjustment...')}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 p-2 outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setEditingInvoice(null)}
                  className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-100 cursor-pointer"
                >
                  {t('إلغاء', 'Cancel')}
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold shadow-md shadow-amber-600/20 cursor-pointer"
                >
                  {t('حفظ التعديل', 'Save Edit')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 3: CANCEL / DELETE SALES INVOICE */}
      {cancellingInvoice && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl dark:bg-slate-900 border border-slate-100 dark:border-slate-800">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800 mb-4">
              <div className="flex items-center gap-2">
                <Trash2 className="h-5 w-5 text-rose-600" />
                <h3 className="text-base font-extrabold text-slate-900 dark:text-white">
                  {t('إلغاء وحذف فاتورة مبيعات', 'Cancel / Delete Invoice')}
                </h3>
              </div>
              <button
                onClick={() => setCancellingInvoice(null)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-white cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Shift Rule Banner */}
            <div className="mb-4 p-3 rounded-xl bg-rose-50/70 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-[11px] text-rose-900 dark:text-rose-200 leading-relaxed">
              <p className="font-bold flex items-center gap-1.5 mb-1">
                <AlertTriangle className="h-3.5 w-3.5 text-rose-600 shrink-0" />
                <span>{t('قاعدة الإلغاء وعكس الإيراد في الشيفت:', 'Cancellation Shift Rule:')}</span>
              </p>
              {cancellingInvoice.sourceShiftId &&
              allReceptionShifts.find((s) => s.id === cancellingInvoice.sourceShiftId)?.status === 'Open' ? (
                <span>
                  {t(
                    'الشيفت الصادر منه الفاتورة ما زال مفتوحاً؛ سيتم إلغاء الفاتورة وتصفير إيرادها في نفس الشيفت مباشرة.',
                    'Source shift is still open; invoice revenue will be zeroed out in it.'
                  )}
                </span>
              ) : (
                <span>
                  {t(
                    'الشيفت الصادر منه الفاتورة مغلق؛ سيتم تسجيل سطر منفصل في الشيفت الحالي المفتوح بعكس الإيراد بالسالب كاسترداد وتسوية.',
                    'Source shift is closed; a separate reversal line with negative revenue will be recorded in current open shift.'
                  )}
                </span>
              )}
            </div>

            <form onSubmit={handleConfirmCancelInvoice} className="space-y-3.5 text-xs">
              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800 space-y-1 font-mono">
                <div className="flex justify-between">
                  <span className="text-slate-400">{t('رقم الفاتورة:', 'Invoice #:')}</span>
                  <span className="font-bold text-slate-800 dark:text-slate-200">{cancellingInvoice.invoiceNumber}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">{t('العميل:', 'Customer:')}</span>
                  <span className="font-bold text-slate-800 dark:text-slate-200">{cancellingInvoice.customerName}</span>
                </div>
                <div className="flex justify-between text-sm font-black text-rose-600">
                  <span>{t('الإيراد المسترد الملغي:', 'Cancelled Revenue:')}</span>
                  <span>{formatMoney(cancellingInvoice.netAmount)}</span>
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                  <span className="text-rose-500 font-bold ml-1">*</span>
                  {t('سبب الإلغاء (إجباري):', 'Reason for Cancellation (Mandatory):')}
                </label>
                <textarea
                  required
                  rows={2}
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                  placeholder={t('اكتب سبب إلغاء هذه الفاتورة...', 'State reason for cancellation...')}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 p-2 outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setCancellingInvoice(null)}
                  className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-100 cursor-pointer"
                >
                  {t('تراجع', 'Back')}
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold shadow-md shadow-rose-600/20 cursor-pointer"
                >
                  {t('تأكيد الإلغاء وعكس الإيراد', 'Confirm Cancel & Reverse')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 4: INVOICE PREVIEW & PRINT */}
      {selectedInvoice && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl dark:bg-slate-900 border border-slate-100 dark:border-slate-800">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <span className="text-sm font-extrabold text-slate-900 dark:text-white">
                {t('معاينة الفاتورة الضريبية الرسمية', 'Official Tax Invoice Preview')}
              </span>
              <button
                onClick={() => setSelectedInvoice(null)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-white cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="my-4 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4 font-mono text-xs dark:border-slate-700 dark:bg-slate-800/60">
              <div className="text-center space-y-1 mb-3">
                <h3 className="font-extrabold text-sm text-slate-900 dark:text-white">{tenant?.name}</h3>
                <p className="text-[11px] text-slate-500 font-bold">
                  {branches.find((b) => b.id === selectedInvoice.branchId)?.name || activeBranch?.name}
                </p>
                <p className="text-[10px] text-slate-400">
                  {selectedInvoice.invoiceNumber} • {selectedInvoice.paymentMethod}
                </p>
                <p className="text-[10px] text-slate-400">
                  {new Date(selectedInvoice.createdAt).toLocaleString(language === 'ar' ? 'ar-EG' : 'en-US')}
                </p>
                {selectedInvoice.status === 'Cancelled' && (
                  <span className="inline-block mt-1 px-2 py-0.5 rounded text-[10px] font-black bg-rose-100 text-rose-700">
                    {t('فاتورة ملغاة', 'CANCELLED INVOICE')}
                  </span>
                )}
              </div>

              <div className="border-t border-b border-dashed border-slate-300 py-2 my-2 space-y-1.5 dark:border-slate-700">
                {selectedInvoice.items && selectedInvoice.items.length > 0 ? (
                  selectedInvoice.items.map((item, idx) => (
                    <div key={idx} className="flex justify-between items-center text-[11px]">
                      <span>
                        {item.productNameAr} x{item.quantity}
                      </span>
                      <span className="font-bold">{formatMoney(item.lineTotal)}</span>
                    </div>
                  ))
                ) : (
                  <div className="flex justify-between items-center text-[11px]">
                    <span>{selectedInvoice.notes || t('إيراد خدمة مباعة', 'Service Revenue')}</span>
                    <span className="font-bold">{formatMoney(selectedInvoice.netAmount)}</span>
                  </div>
                )}
              </div>

              <div className="space-y-1 text-[11px]">
                <div className="flex justify-between">
                  <span>{t('المجموع قبل الضريبة:', 'Subtotal:')}</span>
                  <span>{formatMoney(selectedInvoice.subtotal - (selectedInvoice.discountAmount || 0))}</span>
                </div>
                {selectedInvoice.taxAmount > 0 && (
                  <div className="flex justify-between text-emerald-600">
                    <span>{t('ضريبة ق.م:', 'VAT:')}</span>
                    <span>{formatMoney(selectedInvoice.taxAmount)}</span>
                  </div>
                )}
                <div className="flex justify-between font-extrabold text-sm border-t border-slate-300 pt-1 dark:border-slate-700 text-slate-900 dark:text-white">
                  <span>{t('الصافي الإجمالي:', 'Net Total:')}</span>
                  <span>{formatMoney(selectedInvoice.netAmount)}</span>
                </div>
              </div>

              <div className="mt-4 flex items-center justify-center gap-3 pt-3 border-t border-dashed border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-400">
                <QrCode className="h-10 w-10 text-slate-800 dark:text-slate-200" />
                <div className="text-[10px]">
                  <p className="font-bold">{t('منظومة الفاتورة الإلكترونية', 'Electronic Tax Compliant')}</p>
                  <p>
                    {t('العميل:', 'Client:')} {selectedInvoice.customerName}
                  </p>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => window.print()}
                className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-slate-900 py-2.5 text-xs font-bold text-white hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <Printer className="h-4 w-4" />
                <span>{t('طباعة الفاتورة (Print)', 'Print')}</span>
              </button>
              <button
                onClick={() => setSelectedInvoice(null)}
                className="rounded-xl border border-slate-200 px-4 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 transition-colors cursor-pointer"
              >
                {t('إغلاق', 'Close')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* EXCEL DATA TRANSFER & VALIDATION MODAL FOR REVENUES & INVOICES */}
      <ExcelDataTransferModal
        isOpen={showExcelModal}
        onClose={() => setShowExcelModal(false)}
        entityTitleAr="فواتير المبيعات والإيرادات"
        entityTitleEn="Sales Invoices & Revenues"
        descriptionAr="استيراد وتصدير فواتير المبيعات والإيرادات التشغيلية مع الفحص الخلوي الذكي لمطابقة المبالغ والضرائب"
        columns={invoiceExcelColumns}
        currentDataForExport={serverInvoices.map((inv) => ({
          customerName: inv.customerName,
          patientPhone: '',
          date: inv.createdAt ? inv.createdAt.split('T')[0] : '',
          invoiceNumber: inv.invoiceNumber,
          serviceName: inv.items.map((i) => i.productNameAr).join(' + ') || 'خدمة مبيعات',
          quantity: inv.items.reduce((s, i) => s + (i.quantity || 1), 0),
          netAmount: inv.netAmount,
          taxAmount: inv.taxAmount || 0,
          paymentMethod: inv.paymentMethod || 'نقداً (كاش)',
          notes: inv.notes || '',
        }))}
        exportFileNamePrefix="سجل_الإيرادات_وفواتير_المبيعات"
        validator={validateInvoiceRows}
        onConfirmImport={handleConfirmInvoiceImport}
        branchName={activeBranch?.name || 'الفرع الحالي'}
      />
    </div>
  );
};
