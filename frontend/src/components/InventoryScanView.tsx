import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { BrowserMultiFormatReader } from '@zxing/browser';
import {
  QrCode, Camera, CameraOff, CheckCircle2, AlertTriangle,
  PlusCircle, PackageCheck, Search, Upload, Sparkles, Box, ShieldAlert
} from 'lucide-react';

export interface LotItem {
  id: number;
  ingredient_id: number;
  ingredient_code: string | null;
  ingredient_name_ko: string;
  ingredient_name_en: string;
  unit: string;
  product_name_ko: string | null;
  product_name_en: string | null;
  quantity: number;
  original_quantity: number;
  unit_cost_krw: number;
  received_date: string;
  expiry_date: string;
  days_until_expiry: number;
  expiry_status: 'expired' | 'urgent' | 'warning' | 'good';
  source: string;
  status: string;
  batch_number: string | null;
}

export interface IngredientItem {
  id: number;
  code: string;
  name_ko: string;
  name_en: string;
  unit: string;
  pack_size: number;
  unit_cost_krw: number;
  shelf_life_days: number;
}

export interface IncomingOrderItem {
  id: number;
  ingredient_id: number;
  ingredient_code?: string | null;
  ingredient_name_ko?: string | null;
  ingredient_name_en?: string | null;
  unit?: string;
  supplier_name_ko?: string | null;
  supplier_name_en?: string | null;
  recommended_qty: number;
  approved_qty: number | null;
  expected_delivery_date: string | null;
}

export interface ScanLookupResponse {
  raw_payload: string;
  barcode: string;
  ean13_valid: boolean;
  is_gs1: boolean;
  extracted_expiry: string | null;
  estimated_expiry: string | null;
  expiry_source: 'auto' | 'estimated' | 'manual' | 'photo';
  extracted_batch: string | null;
  product: {
    source: 'internal' | 'public_api';
    product_id: number | null;
    barcode: string;
    name_ko: string;
    name_en: string;
    maker: string;
    food_type: string;
    pack_size: number;
    unit: string;
    standard_shelf_life_days: number;
    ingredient_id: number | null;
    ingredient_name_ko: string | null;
    ingredient_name_en: string | null;
    unit_cost_krw: number;
  } | null;
  incoming_order: IncomingOrderItem | null;
}

export const DEMO_SCAN_PRESETS = [
  {
    category: 'GS1 2D DataMatrix / QR (3)',
    items: [
      {
        label_ko: 'GS1 #1: 비비고 김치 10kg (소비기한 26-11-20)',
        label_en: 'GS1 #1: Bibigo Kimchi 10kg (Use-by 26-11-20)',
        payload: '(01)08801234000017(17)261120(10)LOT-KIMCHI-01',
      },
      {
        label_ko: 'GS1 #2: 종가집 포기김치 10kg (소비기한 26-11-25)',
        label_en: 'GS1 #2: Jongga Pogi Kimchi 10kg (Use-by 26-11-25)',
        payload: '(01)08801234000024(17)261125(10)LOT-PORK-02',
      },
      {
        label_ko: 'GS1 #3: 풀무원 찌개두부 10팩 (소비기한 26-11-10)',
        label_en: 'GS1 #3: Pulmuone Stew Tofu 10pk (Use-by 26-11-10)',
        payload: '(01)08801234000031(17)261110(10)LOT-TOFU-03',
      },
    ],
  },
  {
    category: 'Internal & Public API EAN-13',
    items: [
      {
        label_ko: '내부 DB: 마장동 앞다리살 5kg (8801234000147)',
        label_en: 'Internal DB: Majang Pork Shoulder 5kg (8801234000147)',
        payload: '8801234000147',
      },
      {
        label_ko: '공공 API: 농심 신라면 멀티 5입 (8801043014785)',
        label_en: 'Public API: Nongshim Shin Ramyun 5pk (8801043014785)',
        payload: '8801043014785',
      },
      {
        label_ko: '공공 API: 롯데 칠성사이다 355ml (8801062870119)',
        label_en: 'Public API: Lotte Chilsung Cider 355ml (8801062870119)',
        payload: '8801062870119',
      },
    ],
  },
  {
    category: 'Unknown Barcodes (2)',
    items: [
      {
        label_ko: '미등록 바코드 #1 (8809999900016)',
        label_en: 'Unknown Barcode #1 (8809999900016)',
        payload: '8809999900016',
      },
      {
        label_ko: '미등록 바코드 #2 (8809999900023)',
        label_en: 'Unknown Barcode #2 (8809999900023)',
        payload: '8809999900023',
      },
    ],
  },
];

export function computeOrderDiscrepancy(
  receivedQty: number,
  incomingOrder: IncomingOrderItem | null
): { hasDiscrepancy: boolean; expectedQty: number; diff: number } {
  if (!incomingOrder) {
    return { hasDiscrepancy: false, expectedQty: 0, diff: 0 };
  }
  const expectedQty = incomingOrder.approved_qty ?? incomingOrder.recommended_qty;
  const diff = Number((receivedQty - expectedQty).toFixed(2));
  return {
    hasDiscrepancy: Math.abs(diff) > 0.01,
    expectedQty,
    diff,
  };
}

export function sortLotsFefo(lots: LotItem[]): LotItem[] {
  return [...lots].sort((a, b) => {
    const expCmp = a.expiry_date.localeCompare(b.expiry_date);
    if (expCmp !== 0) return expCmp;
    return a.received_date.localeCompare(b.received_date);
  });
}

export interface ExpiryRiskItem {
  ingredient_id: number;
  ingredient_code: string;
  name_ko: string;
  name_en: string;
  unit: string;
  pack_size: number;
  unit_cost_krw: number;
  coverage_window_days: number;
  use_window_end: string;
  total_on_hand_qty: number;
  usable_qty: number;
  at_risk_qty: number;
  at_risk_value_krw: number;
  est_window_demand_qty: number;
  buffer_qty: number;
  net_need_qty: number;
  recommended_order_qty: number;
  packs_to_order: number;
}

export function calculateSpotVariancePreview(
  systemQty: number,
  countedQty: number,
  unitCostKrw: number
): { varianceQty: number; varianceKrw: number } {
  const varianceQty = Number((countedQty - systemQty).toFixed(2));
  const varianceKrw = Math.round(varianceQty * unitCostKrw);
  return { varianceQty, varianceKrw };
}

export default function InventoryScanView() {
  const { i18n } = useTranslation();
  const isKo = i18n.language.startsWith('ko');

  const [lots, setLots] = useState<LotItem[]>([]);
  const [ingredients, setIngredients] = useState<IngredientItem[]>([]);
  const [incomingOrders, setIncomingOrders] = useState<IncomingOrderItem[]>([]);
  const [expiryRisks, setExpiryRisks] = useState<ExpiryRiskItem[]>([]);
  const [coverageDays, setCoverageDays] = useState<number>(3);
  const [loadingLots, setLoadingLots] = useState(true);

  // M4 Spot Count & FEFO Depletion Simulator state
  const [spotIngredientId, setSpotIngredientId] = useState<number>(1);
  const [spotCountedQty, setSpotCountedQty] = useState<number>(6.0);
  const [spotReason, setSpotReason] = useState<string>('정기 마감 실사 (Evening Line Check)');
  const [spotResultMsg, setSpotResultMsg] = useState<string | null>(null);

  const [depleteIngredientId, setDepleteIngredientId] = useState<number>(1);
  const [depleteDemandQty, setDepleteDemandQty] = useState<number>(4.5);
  const [depleteSimResult, setDepleteSimResult] = useState<any | null>(null);

  // Scanner state
  const [barcodeInput, setBarcodeInput] = useState('(01)08801234000017(17)261120(10)LOT-KIMCHI-01');
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const controlsRef = useRef<{ stop: () => void } | null>(null);

  // Lookup & registration & receiving state
  const [lookupResult, setLookupResult] = useState<ScanLookupResponse | null>(null);
  const [receiveQty, setReceiveQty] = useState<number>(10);
  const [receiveUnitCost, setReceiveUnitCost] = useState<number>(4500);
  const [receiveExpiry, setReceiveExpiry] = useState<string>('2026-11-20');
  const [receiveSource, setReceiveSource] = useState<'auto' | 'estimated' | 'manual' | 'photo'>('auto');
  const [receiveBatch, setReceiveBatch] = useState<string>('LOT-KIMCHI-01');
  const [matchedOrderId, setMatchedOrderId] = useState<number | null>(null);
  const [ocrMessage, setOcrMessage] = useState<string | null>(null);
  const [receiveSuccessMsg, setReceiveSuccessMsg] = useState<string | null>(null);
  const [receiveDiscrepancyMsg, setReceiveDiscrepancyMsg] = useState<string | null>(null);

  // One-time product registration form state
  const [regNameKo, setRegNameKo] = useState('');
  const [regNameEn, setRegNameEn] = useState('');
  const [regMaker, setRegMaker] = useState('');
  const [regFoodType, setRegFoodType] = useState('가공식품');
  const [regPackSize, setRegPackSize] = useState<number>(5);
  const [regUnit, setRegUnit] = useState('kg');
  const [regShelfLife, setRegShelfLife] = useState<number>(14);
  const [regIngredientId, setRegIngredientId] = useState<number>(1);

  // Stock table filter state
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'urgent' | 'warning' | 'good'>('all');

  const fetchAllInventoryData = (winDays: number = coverageDays) => {
    setLoadingLots(true);
    Promise.all([
      fetch('/api/lots').then(r => r.json()),
      fetch('/api/ingredients').then(r => r.json()),
      fetch('/api/orders/incoming').then(r => r.json()),
      fetch(`/api/inventory/expiry-risk?coverage_window_days=${winDays}`).then(r => r.json()),
    ])
      .then(([lotsData, ingData, incData, riskData]) => {
        setLots(Array.isArray(lotsData) ? lotsData : []);
        setIngredients(Array.isArray(ingData) ? ingData : []);
        setIncomingOrders(Array.isArray(incData) ? incData : []);
        setExpiryRisks(Array.isArray(riskData) ? riskData : []);
        if (Array.isArray(ingData) && ingData.length > 0) {
          setRegIngredientId(ingData[0].id);
        }
        setLoadingLots(false);
      })
      .catch(err => {
        console.error(err);
        setLoadingLots(false);
      });
  };

  useEffect(() => {
    fetchAllInventoryData();
    return () => {
      if (controlsRef.current) {
        controlsRef.current.stop();
      }
    };
  }, []);

  const startCameraScan = async () => {
    setCameraError(null);
    setCameraActive(true);
    try {
      const reader = new BrowserMultiFormatReader();
      if (!videoRef.current) return;
      const controls = await reader.decodeFromVideoDevice(
        undefined,
        videoRef.current,
        (result) => {
          if (result) {
            const text = result.getText();
            setBarcodeInput(text);
            handleLookup(text);
            controls.stop();
            setCameraActive(false);
          }
        }
      );
      controlsRef.current = controls;
    } catch (err: any) {
      setCameraError(
        isKo
          ? '카메라 장치를 찾을 수 없거나 권한이 거부되었습니다. 아래 데모 바코드 프리셋 또는 수동 입력을 사용해 주세요.'
          : 'Camera device not found or permission denied. Please use the demo barcode presets or manual input below.'
      );
      setCameraActive(false);
    }
  };

  const stopCameraScan = () => {
    if (controlsRef.current) {
      controlsRef.current.stop();
      controlsRef.current = null;
    }
    setCameraActive(false);
  };

  const handleLookup = (payloadOverride?: string) => {
    const payload = (payloadOverride ?? barcodeInput).trim();
    if (!payload) return;
    setReceiveSuccessMsg(null);
    setReceiveDiscrepancyMsg(null);
    setOcrMessage(null);

    fetch('/api/scan/lookup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ barcode_payload: payload }),
    })
      .then(res => res.json())
      .then((data: ScanLookupResponse) => {
        setLookupResult(data);
        if (data.product) {
          setReceiveQty(data.product.pack_size || 1);
          setReceiveUnitCost(data.product.unit_cost_krw || 5000);
          setReceiveExpiry(data.extracted_expiry || data.estimated_expiry || '2026-11-18');
          setReceiveSource(data.expiry_source || 'estimated');
          setReceiveBatch(data.extracted_batch || `BATCH-${data.barcode.slice(-4)}`);
          setMatchedOrderId(data.incoming_order ? data.incoming_order.id : null);

          // If public API mock, also pre-fill registration form
          if (data.product.source === 'public_api') {
            setRegNameKo(data.product.name_ko);
            setRegNameEn(data.product.name_en);
            setRegMaker(data.product.maker);
            setRegFoodType(data.product.food_type);
            setRegPackSize(data.product.pack_size);
            setRegUnit(data.product.unit);
            setRegShelfLife(data.product.standard_shelf_life_days);
            if (data.product.ingredient_id) {
              setRegIngredientId(data.product.ingredient_id);
            }
          }
        } else {
          // Unknown barcode -> prepare one-time registration defaults
          setRegNameKo('');
          setRegNameEn('');
          setRegMaker('');
          setRegFoodType('가공식품');
          setRegPackSize(5);
          setRegUnit('kg');
          setRegShelfLife(14);
        }
      })
      .catch(err => console.error(err));
  };

  const handleRegisterProduct = (e: React.FormEvent) => {
    e.preventDefault();
    if (!lookupResult) return;

    fetch('/api/scan/register-product', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        barcode: lookupResult.barcode,
        name_ko: regNameKo || `신규 등록 상품 (${lookupResult.barcode.slice(-4)})`,
        name_en: regNameEn || `Registered Product (${lookupResult.barcode.slice(-4)})`,
        maker: regMaker || '일반공급사',
        food_type: regFoodType || '가공식품',
        pack_size: Number(regPackSize) || 1,
        unit: regUnit || 'kg',
        standard_shelf_life_days: Number(regShelfLife) || 14,
        ingredient_id: Number(regIngredientId),
      }),
    })
      .then(res => {
        if (!res.ok) throw new Error('Registration failed');
        return res.json();
      })
      .then(() => {
        handleLookup(lookupResult.raw_payload);
      })
      .catch(err => console.error(err));
  };

  const handleOcrPhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    const file = e.target.files[0];
    const formData = new FormData();
    formData.append('file', file);

    fetch('/api/scan/ocr-expiry', {
      method: 'POST',
      body: formData,
    })
      .then(r => r.json())
      .then(data => {
        setReceiveSource('photo');
        setOcrMessage(isKo ? data.message_ko : data.message_en);
      })
      .catch(err => console.error(err));
  };

  const handleReceiveLot = (e: React.FormEvent) => {
    e.preventDefault();
    if (!lookupResult || !lookupResult.product || !lookupResult.product.ingredient_id) return;

    fetch('/api/scan/receive', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ingredient_id: lookupResult.product.ingredient_id,
        product_id: lookupResult.product.product_id,
        quantity: Number(receiveQty),
        unit_cost_krw: Number(receiveUnitCost),
        expiry_date: receiveExpiry,
        source: receiveSource,
        batch_number: receiveBatch || null,
        matched_order_id: matchedOrderId,
      }),
    })
      .then(r => r.json())
      .then(data => {
        setReceiveSuccessMsg(
          isKo
            ? `입고 완료 (Lot #${data.lot_id}): ${lookupResult.product?.name_ko} ${receiveQty}${lookupResult.product?.unit} (소비기한: ${receiveExpiry})`
            : `Lot #${data.lot_id} received: ${lookupResult.product?.name_en} ${receiveQty} ${lookupResult.product?.unit} (소비기한: ${receiveExpiry})`
        );
        if (data.discrepancy) {
          setReceiveDiscrepancyMsg(data.discrepancy);
        } else {
          setReceiveDiscrepancyMsg(null);
        }
        fetchAllInventoryData();
      })
      .catch(err => console.error(err));
  };

  const handleCreateDemoIncomingOrders = () => {
    fetch('/api/orders/demo-incoming', { method: 'POST' })
      .then(r => r.json())
      .then(() => {
        fetchAllInventoryData();
        if (lookupResult) {
          handleLookup(lookupResult.raw_payload);
        }
      })
      .catch(err => console.error(err));
  };

  const handleRunFefoSim = (commit: boolean) => {
    fetch('/api/inventory/deplete-fefo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ingredient_id: depleteIngredientId,
        demand_qty: Number(depleteDemandQty),
        commit,
      }),
    })
      .then(r => r.json())
      .then(data => {
        setDepleteSimResult(data);
        if (commit) {
          fetchAllInventoryData();
        }
      })
      .catch(err => console.error(err));
  };

  const handleSpotCountSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetch('/api/inventory/spot-count', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ingredient_id: spotIngredientId,
        counted_qty: Number(spotCountedQty),
        reason: spotReason,
      }),
    })
      .then(r => r.json())
      .then(data => {
        setSpotResultMsg(
          isKo
            ? `현장 실사 반영 완료 (${data.name_ko}): 장부 ${data.system_qty}${data.unit} → 실사 ${data.counted_qty}${data.unit} (차이 ${data.variance_qty > 0 ? '+' : ''}${data.variance_qty}${data.unit}, ₩${data.variance_krw.toLocaleString()})`
            : `Spot count applied (${data.name_en}): System ${data.system_qty} ${data.unit} → Counted ${data.counted_qty} ${data.unit} (Variance ${data.variance_qty > 0 ? '+' : ''}${data.variance_qty} ${data.unit}, ₩${data.variance_krw.toLocaleString()})`
        );
        fetchAllInventoryData();
      })
      .catch(err => console.error(err));
  };

  const selectedSpotIng = ingredients.find(i => i.id === spotIngredientId);
  const selectedSpotSystemQty = Number(
    lots
      .filter(l => l.ingredient_id === spotIngredientId)
      .reduce((acc, l) => acc + l.quantity, 0)
      .toFixed(2)
  );
  const spotPreview = calculateSpotVariancePreview(
    selectedSpotSystemQty,
    Number(spotCountedQty),
    selectedSpotIng?.unit_cost_krw ?? 0
  );

  const discrepancyInfo = computeOrderDiscrepancy(
    Number(receiveQty),
    lookupResult?.incoming_order ?? null
  );

  const filteredLots = sortLotsFefo(lots).filter(lot => {
    const matchesStatus = statusFilter === 'all' || lot.expiry_status === statusFilter;
    const q = searchQuery.trim().toLowerCase();
    const matchesSearch =
      !q ||
      lot.ingredient_name_ko.toLowerCase().includes(q) ||
      lot.ingredient_name_en.toLowerCase().includes(q) ||
      (lot.product_name_ko && lot.product_name_ko.toLowerCase().includes(q)) ||
      (lot.batch_number && lot.batch_number.toLowerCase().includes(q));
    return matchesStatus && matchesSearch;
  });

  const urgentCount = lots.filter(l => l.expiry_status === 'expired' || l.expiry_status === 'urgent').length;
  const warningCount = lots.filter(l => l.expiry_status === 'warning').length;
  const totalStockValueKrw = lots.reduce((sum, l) => sum + l.quantity * l.unit_cost_krw, 0);

  return (
    <div className="space-y-6">
      {/* Header & Demo Incoming Order Trigger */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">
            {isKo ? '재고 로트(FEFO) & 바코드 입고 스캔' : 'Inventory Lots (FEFO) & Barcode Scan Receiving'}
          </h2>
          <p className="text-sm text-gray-500">
            {isKo
              ? 'EAN-13 및 GS1 2D(QR/DataMatrix) 바코드 인식, 3단계 상품 조회(내부 DB → 공공 API → 1회 등록), 발주 대비 입고 검수'
              : 'EAN-13 & GS1 2D scan, 3-tier product lookup (Internal -> Public API -> 1-time registration), and order receiving match'}
          </p>
        </div>

        <button
          onClick={handleCreateDemoIncomingOrders}
          className="flex items-center space-x-2 px-3.5 py-2 bg-teal-50 border border-teal-300 text-teal-900 rounded-lg text-xs font-semibold hover:bg-teal-100 transition shadow-sm"
        >
          <Sparkles className="w-4 h-4 text-teal-700" />
          <span>
            {isKo
              ? `데모 입고예정 발주 준비 (${incomingOrders.length}건 대기)`
              : `Load Demo Incoming Orders (${incomingOrders.length} active)`}
          </span>
        </button>
      </div>

      {/* KPI Summary Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
          <p className="text-xs text-gray-500">{isKo ? '활성 재고 로트 수' : 'Active Inventory Lots'}</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{lots.length}</p>
          <p className="text-xs text-teal-700 mt-1">{isKo ? '소비기한 임박순(FEFO) 정렬' : 'Sorted by FEFO (소비기한)'}</p>
        </div>
        <div className="bg-white p-4 rounded-xl border border-red-200 shadow-sm">
          <p className="text-xs text-red-700 font-medium">{isKo ? '소비기한 긴급 (D-2 이내)' : 'Urgent 소비기한 (≤ 2 Days)'}</p>
          <p className="text-2xl font-bold text-red-600 mt-1">{urgentCount}</p>
          <p className="text-xs text-gray-500 mt-1">
            {isKo ? `주의(D-5 이내): ${warningCount}건` : `Warning (3–5d): ${warningCount} lots`}
          </p>
        </div>
        <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
          <p className="text-xs text-gray-500">{isKo ? '총 가용 재고 자산가치' : 'Total Active Stock Value'}</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">₩{Math.round(totalStockValueKrw).toLocaleString()}</p>
          <p className="text-xs text-gray-500 mt-1">{isKo ? '18개 핵심 식자재 기준' : 'Across 18 core ingredients'}</p>
        </div>
        <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
          <p className="text-xs text-gray-500">{isKo ? '입고 매칭 대기 발주' : 'Incoming Orders to Match'}</p>
          <p className="text-2xl font-bold text-teal-800 mt-1">{incomingOrders.length}</p>
          <p className="text-xs text-gray-500 mt-1">
            {isKo ? '스캔 시 수량 차이 자동 검수' : 'Auto-checks quantity discrepancy'}
          </p>
        </div>
      </div>

      {/* Barcode / GS1 2D Scanner & Lookup Panel */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: Scanner Input + Demo Presets */}
        <div className="lg:col-span-5 bg-white p-5 rounded-xl border border-gray-200 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-gray-800 text-sm flex items-center space-x-2">
              <QrCode className="w-4 h-4 text-teal-700" />
              <span>{isKo ? '바코드 / GS1 2D 스캐너' : 'Barcode / GS1 2D Scanner'}</span>
            </h3>
            <button
              type="button"
              onClick={cameraActive ? stopCameraScan : startCameraScan}
              className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                cameraActive
                  ? 'bg-red-100 text-red-700 hover:bg-red-200'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              {cameraActive ? <CameraOff className="w-3.5 h-3.5" /> : <Camera className="w-3.5 h-3.5" />}
              <span>{cameraActive ? (isKo ? '카메라 중지' : 'Stop Camera') : (isKo ? '카메라 스캔' : 'Camera Scan')}</span>
            </button>
          </div>

          {cameraActive && (
            <div className="rounded-lg overflow-hidden bg-black aspect-video relative">
              <video ref={videoRef} className="w-full h-full object-cover" />
            </div>
          )}

          {cameraError && (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800">
              {cameraError}
            </div>
          )}

          <div className="space-y-2">
            <label className="block text-xs font-semibold text-gray-700">
              {isKo ? '바코드 (EAN-13) 또는 GS1 2D 페이로드 입력' : 'EAN-13 Barcode or GS1 2D Payload'}
            </label>
            <div className="flex space-x-2">
              <input
                type="text"
                value={barcodeInput}
                onChange={e => setBarcodeInput(e.target.value)}
                placeholder="(01)08801234000017(17)261120(10)LOT-01"
                className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-xs font-mono focus:outline-none focus:ring-2 focus:ring-teal-600"
              />
              <button
                type="button"
                onClick={() => handleLookup()}
                className="px-4 py-2 bg-[#078B79] text-white rounded-lg text-xs font-semibold hover:bg-teal-800 transition shrink-0"
              >
                {isKo ? '조회' : 'Lookup'}
              </button>
            </div>
          </div>

          {/* Demo Presets (3 GS1 2D, Internal/Public API, 2 Unknown) */}
          <div className="space-y-3 pt-2 border-t border-gray-100">
            <p className="text-xs font-semibold text-gray-600">
              {isKo ? '원클릭 데모 스캔 프리셋 (클릭 시 즉시 조회)' : 'One-Tap Demo Scan Presets'}
            </p>
            {DEMO_SCAN_PRESETS.map(group => (
              <div key={group.category} className="space-y-1.5">
                <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
                  {group.category}
                </p>
                <div className="grid grid-cols-1 gap-1.5">
                  {group.items.map(item => (
                    <button
                      key={item.payload}
                      type="button"
                      onClick={() => {
                        setBarcodeInput(item.payload);
                        handleLookup(item.payload);
                      }}
                      className="text-left px-3 py-2 rounded-lg border border-gray-200 hover:border-teal-500 hover:bg-teal-50/50 transition flex items-center justify-between group"
                    >
                      <span className="text-xs font-medium text-gray-800 group-hover:text-teal-900">
                        {isKo ? item.label_ko : item.label_en}
                      </span>
                      <span className="text-[10px] font-mono text-gray-400 ml-2 truncate max-w-[150px]">
                        {item.payload}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Right: Lookup Result -> Registration Form OR Receiving Form */}
        <div className="lg:col-span-7 bg-white p-5 rounded-xl border border-gray-200 shadow-sm space-y-4">
          {!lookupResult ? (
            <div className="h-full min-h-[280px] flex flex-col items-center justify-center text-center text-gray-400 space-y-2">
              <Box className="w-10 h-10 text-gray-300" />
              <p className="text-sm font-medium text-gray-600">
                {isKo
                  ? '왼쪽에서 바코드를 조회하거나 데모 프리셋을 선택해 주세요.'
                  : 'Scan a barcode or select a demo preset on the left to inspect and receive stock.'}
              </p>
              <p className="text-xs text-gray-400 max-w-md">
                {isKo
                  ? 'GS1 2D 코드는 소비기한과 배치번호를 자동 추출하며, 미등록 바코드는 최초 1회 상품 등록 후 즉시 입고됩니다.'
                  : 'GS1 2D payloads auto-extract 소비기한 (Use-by Date) and batch number; unknown barcodes trigger one-time registration.'}
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Lookup Header & Badges */}
              <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-gray-200">
                <div>
                  <div className="flex items-center space-x-2">
                    <span className="font-mono text-xs font-bold text-gray-800 bg-gray-100 px-2 py-0.5 rounded">
                      {lookupResult.barcode}
                    </span>
                    {lookupResult.is_gs1 && (
                      <span className="px-2 py-0.5 text-[11px] font-semibold rounded bg-teal-100 text-teal-800">
                        GS1 2D (AI 01/17/10)
                      </span>
                    )}
                    <span
                      className={`px-2 py-0.5 text-[11px] font-semibold rounded ${
                        lookupResult.ean13_valid
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-red-100 text-red-800'
                      }`}
                    >
                      {lookupResult.ean13_valid ? 'EAN-13 Checksum OK' : 'Invalid EAN-13'}
                    </span>
                  </div>
                </div>

                {/* Tier Badge */}
                <div>
                  {lookupResult.product?.source === 'internal' && (
                    <span className="px-2.5 py-1 text-xs font-semibold rounded-full bg-teal-50 text-teal-800 border border-teal-200">
                      {isKo ? '1단계: 매장 등록 상품 (Internal DB)' : 'Tier 1: Internal DB Product'}
                    </span>
                  )}
                  {lookupResult.product?.source === 'public_api' && (
                    <span className="px-2.5 py-1 text-xs font-semibold rounded-full bg-blue-50 text-blue-800 border border-blue-200">
                      {isKo ? '2단계: 공공 식품 API 조회됨 (Public API)' : 'Tier 2: Public Food API Match'}
                    </span>
                  )}
                  {!lookupResult.product && (
                    <span className="px-2.5 py-1 text-xs font-semibold rounded-full bg-amber-50 text-amber-800 border border-amber-300">
                      {isKo ? '3단계: 미등록 바코드 (최초 1회 등록 필요)' : 'Tier 3: Unknown Barcode (1-Time Registration)'}
                    </span>
                  )}
                </div>
              </div>

              {/* Case A: Unknown Barcode OR Unregistered Public API -> One-Time Registration Form */}
              {(!lookupResult.product || lookupResult.product.source === 'public_api') && (
                <form onSubmit={handleRegisterProduct} className="bg-amber-50/70 border border-amber-200 rounded-xl p-4 space-y-3">
                  <div className="flex items-center space-x-2 text-amber-900 font-bold text-sm">
                    <PlusCircle className="w-4 h-4 text-amber-700" />
                    <span>
                      {lookupResult.product?.source === 'public_api'
                        ? isKo
                          ? '공공 API 상품 확인 — 매장 식자재 매핑 및 1회 등록'
                          : 'Public API Product Found — Map Ingredient & Register Once'
                        : isKo
                        ? '미등록 바코드 — 최초 1회 상품 등록 (이후 자동 인식)'
                        : 'Unknown Barcode — One-Time Product Registration'}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">
                        {isKo ? '상품명 (국문)' : 'Product Name (KO)'}
                      </label>
                      <input
                        type="text"
                        required
                        value={regNameKo}
                        onChange={e => setRegNameKo(e.target.value)}
                        placeholder="예: 강원 고랭지 절임배추 10kg"
                        className="w-full px-3 py-1.5 bg-white border border-gray-300 rounded-lg text-xs"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">
                        {isKo ? '상품명 (영문)' : 'Product Name (EN)'}
                      </label>
                      <input
                        type="text"
                        required
                        value={regNameEn}
                        onChange={e => setRegNameEn(e.target.value)}
                        placeholder="e.g., Gangwon Salted Cabbage 10kg"
                        className="w-full px-3 py-1.5 bg-white border border-gray-300 rounded-lg text-xs"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">
                        {isKo ? '제조사 / 브랜드' : 'Maker / Brand'}
                      </label>
                      <input
                        type="text"
                        required
                        value={regMaker}
                        onChange={e => setRegMaker(e.target.value)}
                        placeholder="예: 평창영농조합"
                        className="w-full px-3 py-1.5 bg-white border border-gray-300 rounded-lg text-xs"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">
                        {isKo ? '연결할 매장 핵심 식자재' : 'Link to Core Ingredient'}
                      </label>
                      <select
                        value={regIngredientId}
                        onChange={e => setRegIngredientId(Number(e.target.value))}
                        className="w-full px-3 py-1.5 bg-white border border-gray-300 rounded-lg text-xs"
                      >
                        {ingredients.map(ing => (
                          <option key={ing.id} value={ing.id}>
                            {isKo ? `${ing.name_ko} (${ing.unit})` : `${ing.name_en} (${ing.unit})`}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">
                        {isKo ? '포장 규격 (수량 & 단위)' : 'Pack Size & Unit'}
                      </label>
                      <div className="flex space-x-2">
                        <input
                          type="number"
                          step="0.1"
                          required
                          value={regPackSize}
                          onChange={e => setRegPackSize(Number(e.target.value))}
                          className="w-2/3 px-3 py-1.5 bg-white border border-gray-300 rounded-lg text-xs"
                        />
                        <input
                          type="text"
                          required
                          value={regUnit}
                          onChange={e => setRegUnit(e.target.value)}
                          className="w-1/3 px-2 py-1.5 bg-white border border-gray-300 rounded-lg text-xs"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">
                        {isKo ? '표준 소비기한 (일수)' : 'Standard Shelf Life (Days)'}
                      </label>
                      <input
                        type="number"
                        required
                        value={regShelfLife}
                        onChange={e => setRegShelfLife(Number(e.target.value))}
                        className="w-full px-3 py-1.5 bg-white border border-gray-300 rounded-lg text-xs"
                      />
                    </div>
                  </div>

                  <div className="flex justify-end">
                    <button
                      type="submit"
                      className="px-4 py-2 bg-amber-600 text-white rounded-lg text-xs font-semibold hover:bg-amber-700 transition"
                    >
                      {isKo ? '상품 1회 등록 완료 및 입고 진행' : 'Save Product & Proceed to Receive'}
                    </button>
                  </div>
                </form>
              )}

              {/* Case B: Registered Product -> Lot Receiving & Incoming Order Match Form */}
              {lookupResult.product && lookupResult.product.source === 'internal' && (
                <form onSubmit={handleReceiveLot} className="space-y-4">
                  {/* Product Summary Card */}
                  <div className="p-3.5 bg-gray-50 rounded-xl border border-gray-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div>
                      <p className="text-sm font-bold text-gray-900">
                        {isKo ? lookupResult.product.name_ko : lookupResult.product.name_en}
                      </p>
                      <p className="text-xs text-gray-500">
                        {lookupResult.product.maker} · {lookupResult.product.food_type} ·{' '}
                        {isKo ? '매핑 식자재:' : 'Ingredient:'}{' '}
                        <span className="font-semibold text-teal-800">
                          {isKo ? lookupResult.product.ingredient_name_ko : lookupResult.product.ingredient_name_en}
                        </span>
                      </p>
                    </div>
                    <div className="text-right">
                      <span className="text-xs font-semibold text-gray-700 bg-white px-2.5 py-1 rounded border border-gray-200">
                        {isKo ? '기본 규격:' : 'Pack:'} {lookupResult.product.pack_size} {lookupResult.product.unit}
                      </span>
                    </div>
                  </div>

                  {/* Incoming Order Match Banner */}
                  {lookupResult.incoming_order && (
                    <div className="p-3.5 bg-teal-50 border border-teal-200 rounded-xl space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-teal-900 flex items-center space-x-1.5">
                          <PackageCheck className="w-4 h-4 text-teal-700" />
                          <span>
                            {isKo
                              ? `입고 예정 발주 매칭됨 (Order #${lookupResult.incoming_order.id})`
                              : `Matched Incoming Order #${lookupResult.incoming_order.id}`}
                          </span>
                        </span>
                        <span className="text-xs font-semibold text-teal-800">
                          {isKo ? '발주 수량:' : 'Ordered:'}{' '}
                          {lookupResult.incoming_order.approved_qty ?? lookupResult.incoming_order.recommended_qty}{' '}
                          {lookupResult.product.unit}
                        </span>
                      </div>

                      {discrepancyInfo.hasDiscrepancy && (
                        <div className="flex items-center space-x-2 text-xs text-amber-800 bg-amber-100/80 px-3 py-1.5 rounded-lg border border-amber-300">
                          <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0" />
                          <span>
                            {isKo
                              ? `수량 차이 감지: 발주 ${discrepancyInfo.expectedQty}${lookupResult.product.unit} vs 입고 입력 ${receiveQty}${lookupResult.product.unit} (차이 ${discrepancyInfo.diff > 0 ? '+' : ''}${discrepancyInfo.diff}${lookupResult.product.unit}) — 감사 로그에 자동 기록됩니다.`
                              : `Quantity discrepancy: ordered ${discrepancyInfo.expectedQty} vs receiving ${receiveQty} (${discrepancyInfo.diff > 0 ? '+' : ''}${discrepancyInfo.diff}) — will be logged in Audit Log.`}
                          </span>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Receiving Fields */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-gray-700 mb-1">
                        {isKo ? `입고 수량 (${lookupResult.product.unit})` : `Receiving Quantity (${lookupResult.product.unit})`}
                      </label>
                      <input
                        type="number"
                        step="0.1"
                        required
                        value={receiveQty}
                        onChange={e => setReceiveQty(Number(e.target.value))}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-gray-700 mb-1">
                        {isKo ? '단가 (₩ / 단위)' : 'Unit Cost (₩ / unit)'}
                      </label>
                      <input
                        type="number"
                        required
                        value={receiveUnitCost}
                        onChange={e => setReceiveUnitCost(Number(e.target.value))}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs"
                      />
                    </div>

                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="text-xs font-semibold text-gray-700">
                          {isKo ? '소비기한 (Use-by Date)' : '소비기한 (Use-by Date)'}
                        </label>
                        <span className="text-[11px] font-semibold px-1.5 py-0.5 rounded bg-gray-100 text-gray-700">
                          {receiveSource === 'auto'
                            ? isKo ? 'GS1 자동 (auto)' : 'GS1 Auto'
                            : receiveSource === 'estimated'
                            ? isKo ? '표준기한 추정 (estimated)' : 'Estimated'
                            : receiveSource === 'photo'
                            ? isKo ? '사진 스텁 (photo)' : 'Photo Stub'
                            : isKo ? '수동 입력 (manual)' : 'Manual'}
                        </span>
                      </div>
                      <input
                        type="date"
                        required
                        value={receiveExpiry}
                        onChange={e => {
                          setReceiveExpiry(e.target.value);
                          setReceiveSource('manual');
                        }}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-gray-700 mb-1">
                        {isKo ? '배치 / 로트 번호 (Batch/Lot)' : 'Batch / Lot Number'}
                      </label>
                      <input
                        type="text"
                        value={receiveBatch}
                        onChange={e => setReceiveBatch(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs font-mono"
                      />
                    </div>
                  </div>

                  {/* Expiry Label Photo OCR Stub Upload + Submit */}
                  <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                    <label className="flex items-center space-x-1.5 px-3 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-xs font-medium cursor-pointer transition">
                      <Upload className="w-3.5 h-3.5 text-gray-600" />
                      <span>{isKo ? '소비기한 라벨 사진 업로드 (OCR 스텁)' : 'Upload 소비기한 Photo (OCR Stub)'}</span>
                      <input type="file" accept="image/*" onChange={handleOcrPhotoUpload} className="hidden" />
                    </label>

                    <button
                      type="submit"
                      className="px-5 py-2 bg-[#078B79] text-white rounded-lg text-xs font-bold hover:bg-teal-800 transition shadow-sm"
                    >
                      {isKo ? '로트 입고 확정 (FEFO 등록)' : 'Confirm Lot Receiving (FEFO)'}
                    </button>
                  </div>

                  {ocrMessage && (
                    <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-900">
                      {ocrMessage}
                    </div>
                  )}

                  {receiveSuccessMsg && (
                    <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-xs text-emerald-900 flex items-start space-x-2">
                      <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" />
                      <div>
                        <p className="font-semibold">{receiveSuccessMsg}</p>
                        {receiveDiscrepancyMsg && (
                          <p className="text-amber-800 font-medium mt-1">⚠ {receiveDiscrepancyMsg}</p>
                        )}
                      </div>
                    </div>
                  )}
                </form>
              )}
            </div>
          )}
        </div>
      </div>

      {/* M4: Supplier-Window Expiry-Risk Simulation & Physical Spot Count */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left 7 cols: Expiry-Risk Simulation & FEFO Depletion Simulator */}
        <div className="lg:col-span-7 bg-white p-5 rounded-xl border border-gray-200 shadow-sm space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="font-bold text-gray-800 text-sm">
                {isKo
                  ? '공급 주기별 소비기한 만료 위험(Expiry-Risk) & FEFO 소진 시뮬레이션'
                  : 'Supplier-Window Expiry-Risk & FEFO Depletion Simulator'}
              </h3>
              <p className="text-xs text-gray-500">
                {isKo
                  ? '사용 기간 전에 소비기한이 만료되는 로트(예: 앞다리살 Lot A 4.0kg)는 가용 재고에서 자동 제외됩니다.'
                  : 'Lots expiring before the supplier use window ends (e.g., Pork Lot A 4.0 kg) are excluded as at-risk.'}
              </p>
            </div>
            <div className="flex items-center space-x-1 bg-gray-100 p-1 rounded-lg text-xs">
              {[3, 5, 7].map(d => (
                <button
                  key={d}
                  type="button"
                  onClick={() => {
                    setCoverageDays(d);
                    fetchAllInventoryData(d);
                  }}
                  className={`px-2.5 py-1 rounded-md transition ${
                    coverageDays === d ? 'bg-white shadow text-teal-800 font-semibold' : 'text-gray-600'
                  }`}
                >
                  {isKo ? `${d}일 주기` : `${d}d Window`}
                </button>
              ))}
            </div>
          </div>

          {/* At-Risk Ingredients Highlight Table */}
          <div className="overflow-x-auto border border-gray-200 rounded-lg">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-gray-50 text-gray-500 border-b border-gray-200">
                  <th className="py-2 px-3">{isKo ? '식자재' : 'Ingredient'}</th>
                  <th className="py-2 px-3 text-right">{isKo ? '장부 총재고' : 'Total On-Hand'}</th>
                  <th className="py-2 px-3 text-right text-teal-800">{isKo ? '가용 재고' : 'Usable'}</th>
                  <th className="py-2 px-3 text-right text-red-700">{isKo ? '만료위험 제외' : 'At-Risk Excluded'}</th>
                  <th className="py-2 px-3 text-right">{isKo ? '위험 금액' : 'At-Risk ₩'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {expiryRisks.slice(0, 6).map(r => (
                  <tr key={r.ingredient_id} className={r.at_risk_qty > 0 ? 'bg-red-50/40' : ''}>
                    <td className="py-2 px-3 font-semibold text-gray-900">
                      {isKo ? r.name_ko : r.name_en}
                    </td>
                    <td className="py-2 px-3 text-right font-mono">
                      {r.total_on_hand_qty} {r.unit}
                    </td>
                    <td className="py-2 px-3 text-right font-mono font-bold text-teal-800">
                      {r.usable_qty} {r.unit}
                    </td>
                    <td className="py-2 px-3 text-right font-mono font-bold text-red-600">
                      {r.at_risk_qty > 0 ? `${r.at_risk_qty} ${r.unit}` : '-'}
                    </td>
                    <td className="py-2 px-3 text-right font-mono text-gray-700">
                      {r.at_risk_value_krw > 0 ? `₩${r.at_risk_value_krw.toLocaleString()}` : '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Interactive FEFO Depletion Simulator */}
          <div className="pt-2 border-t border-gray-100 space-y-2">
            <p className="text-xs font-semibold text-gray-700">
              {isKo ? 'FEFO 로트 차감 시뮬레이터 (선입선출/소비기한 임박순)' : 'Interactive FEFO Lot Depletion Simulator'}
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={depleteIngredientId}
                onChange={e => setDepleteIngredientId(Number(e.target.value))}
                className="px-3 py-1.5 border border-gray-300 rounded-lg text-xs bg-white"
              >
                {ingredients.map(ing => (
                  <option key={ing.id} value={ing.id}>
                    {isKo ? `${ing.name_ko} (${ing.unit})` : `${ing.name_en} (${ing.unit})`}
                  </option>
                ))}
              </select>
              <input
                type="number"
                step="0.1"
                value={depleteDemandQty}
                onChange={e => setDepleteDemandQty(Number(e.target.value))}
                className="w-24 px-3 py-1.5 border border-gray-300 rounded-lg text-xs"
              />
              <button
                type="button"
                onClick={() => handleRunFefoSim(false)}
                className="px-3 py-1.5 bg-teal-700 text-white rounded-lg text-xs font-semibold hover:bg-teal-800 transition"
              >
                {isKo ? 'FEFO 소진 시뮬레이션' : 'Simulate FEFO'}
              </button>
            </div>

            {depleteSimResult && (
              <div className="p-3 bg-gray-50 border border-gray-200 rounded-lg text-xs space-y-1">
                <p className="font-semibold text-gray-800">
                  {isKo
                    ? `요청 수요 ${depleteSimResult.requested_demand_qty} → 총 차감 ${depleteSimResult.total_depleted_qty} (부족분: ${depleteSimResult.unmet_shortfall_qty})`
                    : `Demand ${depleteSimResult.requested_demand_qty} → Depleted ${depleteSimResult.total_depleted_qty} (Shortfall: ${depleteSimResult.unmet_shortfall_qty})`}
                </p>
                <div className="flex flex-wrap gap-2 pt-1">
                  {depleteSimResult.updated_lots?.map((u: any) => (
                    <span key={u.id} className="px-2 py-1 bg-white border border-gray-200 rounded font-mono text-[11px]">
                      {u.batch_number || `Lot #${u.id}`} ({u.expiry_date}): -{u.depleted_qty} → {u.remaining_qty} ({u.status_after})
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right 5 cols: Physical Spot Count Adjustment */}
        <div className="lg:col-span-5 bg-white p-5 rounded-xl border border-gray-200 shadow-sm space-y-4">
          <div>
            <h3 className="font-bold text-gray-800 text-sm">
              {isKo ? '현장 실사 및 재고 차이 조정 (Spot Count)' : 'Physical Spot Count & Variance Adjustment'}
            </h3>
            <p className="text-xs text-gray-500">
              {isKo
                ? '실사 수량 입력 시 장부 재고와의 차이를 FEFO 순서로 조정하고 감사 로그에 기록합니다.'
                : 'Adjusts active lots in FEFO order to match physical count and logs variance in Audit Log.'}
            </p>
          </div>

          <form onSubmit={handleSpotCountSubmit} className="space-y-3">
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">
                {isKo ? '실사 대상 식자재' : 'Select Ingredient'}
              </label>
              <select
                value={spotIngredientId}
                onChange={e => {
                  const nextId = Number(e.target.value);
                  setSpotIngredientId(nextId);
                  const sysQ = Number(
                    lots
                      .filter(l => l.ingredient_id === nextId)
                      .reduce((acc, l) => acc + l.quantity, 0)
                      .toFixed(2)
                  );
                  setSpotCountedQty(sysQ);
                }}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs bg-white"
              >
                {ingredients.map(ing => (
                  <option key={ing.id} value={ing.id}>
                    {isKo ? `${ing.name_ko} (${ing.unit})` : `${ing.name_en} (${ing.unit})`}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 bg-gray-50 rounded-lg border border-gray-200">
                <p className="text-[11px] text-gray-500">{isKo ? '현재 장부상 재고' : 'System On-Hand'}</p>
                <p className="text-base font-bold text-gray-900 mt-0.5">
                  {selectedSpotSystemQty} {selectedSpotIng?.unit || 'kg'}
                </p>
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-gray-700 mb-1">
                  {isKo ? `실제 실사 수량 (${selectedSpotIng?.unit || 'kg'})` : `Physical Count (${selectedSpotIng?.unit || 'kg'})`}
                </label>
                <input
                  type="number"
                  step="0.1"
                  required
                  value={spotCountedQty}
                  onChange={e => setSpotCountedQty(Number(e.target.value))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs font-bold"
                />
              </div>
            </div>

            <div className="p-3 bg-amber-50/70 border border-amber-200 rounded-lg flex items-center justify-between text-xs">
              <span className="text-gray-700 font-medium">{isKo ? '예상 재고 차이 (Variance):' : 'Projected Variance:'}</span>
              <span className={`font-mono font-bold ${spotPreview.varianceQty < 0 ? 'text-red-700' : spotPreview.varianceQty > 0 ? 'text-teal-800' : 'text-gray-600'}`}>
                {spotPreview.varianceQty > 0 ? '+' : ''}
                {spotPreview.varianceQty} {selectedSpotIng?.unit || 'kg'} (₩{spotPreview.varianceKrw.toLocaleString()})
              </span>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">
                {isKo ? '실사 조정 사유' : 'Adjustment Reason'}
              </label>
              <input
                type="text"
                required
                value={spotReason}
                onChange={e => setSpotReason(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs"
              />
            </div>

            <button
              type="submit"
              className="w-full py-2 bg-[#078B79] text-white rounded-lg text-xs font-bold hover:bg-teal-800 transition shadow-sm"
            >
              {isKo ? '현장 실사 반영 및 감사로그 기록' : 'Apply Spot Count & Log Variance'}
            </button>

            {spotResultMsg && (
              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-xs text-emerald-900 font-medium">
                {spotResultMsg}
              </div>
            )}
          </form>
        </div>
      </div>

      {/* Active Stock Table (FEFO Ordered) */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="font-bold text-gray-800 text-sm">
              {isKo ? '현재 가용 재고 로트 테이블 (FEFO: 소비기한 임박순)' : 'Active Inventory Stock Table (FEFO Order by 소비기한)'}
            </h3>
            <p className="text-xs text-gray-500">
              {isKo
                ? '모든 재고는 소비기한(Use-by Date)이 가장 빠른 로트부터 먼저 소진(FEFO)됩니다.'
                : 'All lots are depleted in strict First-Expired, First-Out (FEFO) order based on 소비기한.'}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-gray-400 absolute left-2.5 top-2.5" />
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder={isKo ? '식자재 / 배치 검색...' : 'Search ingredient / batch...'}
                className="pl-8 pr-3 py-1.5 border border-gray-300 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-teal-600"
              />
            </div>

            <div className="bg-gray-100 p-1 rounded-lg flex text-xs font-medium">
              {(['all', 'urgent', 'warning', 'good'] as const).map(st => (
                <button
                  key={st}
                  type="button"
                  onClick={() => setStatusFilter(st)}
                  className={`px-2.5 py-1 rounded-md transition ${
                    statusFilter === st ? 'bg-white shadow text-teal-800 font-semibold' : 'text-gray-600'
                  }`}
                >
                  {st === 'all'
                    ? isKo ? '전체' : 'All'
                    : st === 'urgent'
                    ? isKo ? '긴급(≤2일)' : 'Urgent (≤2d)'
                    : st === 'warning'
                    ? isKo ? '주의(3~5일)' : 'Warning (3-5d)'
                    : isKo ? '양호(>5일)' : 'Good (>5d)'}
                </button>
              ))}
            </div>
          </div>
        </div>

        {loadingLots ? (
          <div className="p-8 text-center text-sm text-gray-400">
            {isKo ? '재고 로트 불러오는 중...' : 'Loading inventory lots...'}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-gray-50 text-gray-500 text-xs uppercase border-b border-gray-200">
                  <th className="py-3 px-4">{isKo ? 'FEFO 순위' : 'FEFO #'}</th>
                  <th className="py-3 px-4">{isKo ? '식자재명' : 'Ingredient'}</th>
                  <th className="py-3 px-4">{isKo ? '배치 번호' : 'Batch'}</th>
                  <th className="py-3 px-4 text-right">{isKo ? '현재 잔량' : 'On-Hand Qty'}</th>
                  <th className="py-3 px-4">{isKo ? '입고일' : 'Received'}</th>
                  <th className="py-3 px-4">{isKo ? '소비기한 (Use-by)' : '소비기한 (Use-by)'}</th>
                  <th className="py-3 px-4">{isKo ? '잔여일 / 상태' : 'Days Left'}</th>
                  <th className="py-3 px-4">{isKo ? '인식 출처' : 'Source'}</th>
                  <th className="py-3 px-4 text-right">{isKo ? '로트 금액' : 'Lot Value'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 text-sm">
                {filteredLots.map((lot, idx) => {
                  const badgeStyle =
                    lot.expiry_status === 'expired' || lot.expiry_status === 'urgent'
                      ? 'bg-red-100 text-red-800 border border-red-200'
                      : lot.expiry_status === 'warning'
                      ? 'bg-amber-100 text-amber-800 border border-amber-200'
                      : 'bg-emerald-100 text-emerald-800 border border-emerald-200';

                  return (
                    <tr key={lot.id} className="hover:bg-gray-50">
                      <td className="py-3 px-4 font-mono text-xs text-gray-500">#{idx + 1}</td>
                      <td className="py-3 px-4 font-semibold text-gray-900">
                        {isKo ? lot.ingredient_name_ko : lot.ingredient_name_en}
                        {lot.product_name_ko && (
                          <p className="text-xs font-normal text-gray-500">
                            {isKo ? lot.product_name_ko : lot.product_name_en}
                          </p>
                        )}
                      </td>
                      <td className="py-3 px-4 font-mono text-xs text-gray-600">
                        {lot.batch_number || '-'}
                      </td>
                      <td className="py-3 px-4 text-right font-bold text-teal-800">
                        {lot.quantity} {lot.unit}
                        <span className="text-xs font-normal text-gray-400 ml-1">
                          / {lot.original_quantity}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-xs text-gray-600">{lot.received_date}</td>
                      <td className="py-3 px-4 font-mono text-xs font-semibold text-gray-900">
                        {lot.expiry_date}
                      </td>
                      <td className="py-3 px-4">
                        <span className={`px-2 py-0.5 rounded text-xs font-semibold inline-flex items-center space-x-1 ${badgeStyle}`}>
                          {(lot.expiry_status === 'expired' || lot.expiry_status === 'urgent') && (
                            <ShieldAlert className="w-3 h-3 mr-1" />
                          )}
                          <span>
                            {lot.days_until_expiry < 0
                              ? isKo ? `만료 (${lot.days_until_expiry}일)` : `Expired (${lot.days_until_expiry}d)`
                              : `D-${lot.days_until_expiry}`}
                          </span>
                        </span>
                      </td>
                      <td className="py-3 px-4 text-xs">
                        <span className="px-2 py-0.5 rounded bg-gray-100 text-gray-700 font-medium">
                          {lot.source}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right text-gray-700 font-medium">
                        ₩{Math.round(lot.quantity * lot.unit_cost_krw).toLocaleString()}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
