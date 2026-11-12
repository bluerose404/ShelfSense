import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { BrowserMultiFormatReader } from '@zxing/browser';
import {
  QrCode, Camera, CameraOff, CheckCircle2, AlertTriangle,
  PlusCircle, PackageCheck, Search, Upload, Box, ShieldAlert
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
    } catch {
      setCameraError(
        isKo
          ? '카메라 장치를 찾을 수 없거나 권한이 거부되었습니다. 아래 데모 바코드 프리셋 또는 수동 입력을 사용해 주세요.'
          : 'Camera not found or permission denied. Use the demo barcode presets or manual input below.'
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
            ? `입고 완료 (Lot #${data.lot_id}): ${lookupResult.product?.name_ko} ${receiveQty} ${lookupResult.product?.unit} (소비기한: ${receiveExpiry})`
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
            ? `현장 실사 반영 완료 (${data.name_ko}): 장부 ${data.system_qty} ${data.unit} → 실사 ${data.counted_qty} ${data.unit} (차이 ${data.variance_qty > 0 ? '+' : ''}${data.variance_qty} ${data.unit}, ₩${data.variance_krw.toLocaleString()})`
            : `Spot count saved (${data.name_en}): System ${data.system_qty} ${data.unit} → Counted ${data.counted_qty} ${data.unit} (Variance ${data.variance_qty > 0 ? '+' : ''}${data.variance_qty} ${data.unit}, ₩${data.variance_krw.toLocaleString()})`
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
    <div>
      <h1 className="ss-page-title">
        {isKo ? '재고 로트(FEFO) & 바코드 입고 스캔' : 'Stock lots (FEFO) & barcode scan receiving'}
      </h1>
      <p className="ss-page-desc">
        {isKo
          ? 'EAN-13 및 GS1 2D(QR/DataMatrix) 바코드 인식, 3단계 상품 조회(내부 DB → 공공 API → 1회 등록), 발주 대비 입고 검수입니다.'
          : 'EAN-13 and GS1 2D barcode scanning, 3-tier product lookup (internal DB, public API, one-time registration), and incoming order matching.'}
      </p>

      {/* Shelf-Label KPI Tiles */}
      <section className="ss-section">
        <div className="ss-section-title justify-between flex-wrap">
          <span>{isKo ? '재고 현황 요약' : 'Inventory overview'}</span>
          <button
            type="button"
            onClick={handleCreateDemoIncomingOrders}
            className="ss-btn ss-btn-secondary ss-btn-sm"
          >
            <span>
              {isKo
                ? `데모 입고예정 발주 불러오기 (${incomingOrders.length}건 대기)`
                : `Load demo incoming orders (${incomingOrders.length} active)`}
            </span>
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="ss-tile">
            <div className="ss-figure">{lots.length}</div>
            <div className="ss-figure-label">{isKo ? '활성 재고 로트 수' : 'Active inventory lots'}</div>
            <p className="ss-meta mt-2">{isKo ? '소비기한 임박순(FEFO) 정렬' : 'Sorted by FEFO (소비기한)'}</p>
          </div>
          <div className="ss-tile ss-tile-critical">
            <div className="ss-figure">{urgentCount}</div>
            <div className="ss-figure-label">{isKo ? '소비기한 긴급 (2일 이내)' : 'Urgent 소비기한 (≤2 days)'}</div>
            <p className="text-xs text-paper/80 mt-2 tabular-nums">
              {isKo ? `주의(3~5일): ${warningCount}건` : `Warning (3–5d): ${warningCount} lots`}
            </p>
          </div>
          <div className="ss-tile">
            <div className="ss-figure">₩{Math.round(totalStockValueKrw).toLocaleString()}</div>
            <div className="ss-figure-label">{isKo ? '총 가용 재고 자산가치' : 'Total active stock value'}</div>
            <p className="ss-meta mt-2">{isKo ? '18개 핵심 식자재 기준' : 'Across 18 core ingredients'}</p>
          </div>
          <div className="ss-tile">
            <div className="ss-figure">{incomingOrders.length}</div>
            <div className="ss-figure-label">{isKo ? '입고 매칭 대기 발주' : 'Incoming orders to match'}</div>
            <p className="ss-meta mt-2">{isKo ? '스캔 시 수량 차이 자동 검수' : 'Checks quantity discrepancy on scan'}</p>
          </div>
        </div>
      </section>

      {/* Barcode / GS1 2D Scanner & Lookup Panel */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Left: Scanner Input + Demo Presets */}
        <section className="lg:col-span-5 ss-section space-y-4">
          <div className="ss-section-title justify-between">
            <span className="inline-flex items-center gap-2">
              <QrCode className="w-5 h-5" aria-hidden="true" />
              <span>{isKo ? '바코드 / GS1 2D 스캐너' : 'Barcode / GS1 2D scanner'}</span>
            </span>
            <button
              type="button"
              onClick={cameraActive ? stopCameraScan : startCameraScan}
              className="ss-btn ss-btn-secondary ss-btn-sm"
            >
              {cameraActive ? <CameraOff className="w-4 h-4" /> : <Camera className="w-4 h-4" />}
              <span>{cameraActive ? (isKo ? '카메라 중지' : 'Stop camera') : (isKo ? '카메라 스캔' : 'Camera scan')}</span>
            </button>
          </div>

          {cameraActive && (
            <div className="border-2 border-ink bg-ink aspect-video relative">
              <video ref={videoRef} className="w-full h-full object-cover" />
            </div>
          )}

          {cameraError && (
            <div className="ss-note ss-note-attention">
              <AlertTriangle className="w-4 h-4 text-signal" aria-hidden="true" />
              <span>{cameraError}</span>
            </div>
          )}

          <div>
            <label className="ss-label">
              {isKo ? '바코드 (EAN-13) 또는 GS1 2D 페이로드' : 'EAN-13 barcode or GS1 2D payload'}
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={barcodeInput}
                onChange={e => setBarcodeInput(e.target.value)}
                placeholder="(01)08801234000017(17)261120(10)LOT-01"
                className="ss-input flex-1 tabular-nums"
              />
              <button
                type="button"
                onClick={() => handleLookup()}
                className="ss-btn ss-btn-primary shrink-0"
              >
                {isKo ? '바코드 조회' : 'Scan barcode'}
              </button>
            </div>
          </div>

          {/* Demo Presets (3 GS1 2D, Internal/Public API, 2 Unknown) */}
          <div className="space-y-3 pt-2 border-t border-ink/15">
            <p className="text-xs font-bold">
              {isKo ? '원클릭 데모 스캔 프리셋 (클릭 시 즉시 조회)' : 'One-tap demo scan presets'}
            </p>
            {DEMO_SCAN_PRESETS.map(group => (
              <div key={group.category} className="space-y-1.5">
                <p className="ss-meta font-bold">{group.category}</p>
                <div className="grid grid-cols-1 gap-1.5">
                  {group.items.map(item => (
                    <button
                      key={item.payload}
                      type="button"
                      onClick={() => {
                        setBarcodeInput(item.payload);
                        handleLookup(item.payload);
                      }}
                      className="text-left px-3 py-2 border border-ink/35 hover:bg-ink/5 flex items-center justify-between gap-2 cursor-pointer"
                    >
                      <span className="text-xs font-bold">
                        {isKo ? item.label_ko : item.label_en}
                      </span>
                      <span className="ss-meta tabular-nums truncate max-w-[150px]">
                        {item.payload}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Right: Lookup Result -> Registration Form OR Receiving Form */}
        <section className="lg:col-span-7 ss-section">
          <h2 className="ss-section-title">
            {isKo ? '상품 판별 및 로트 입고 검수' : 'Product lookup & lot receiving'}
          </h2>

          {!lookupResult ? (
            <div className="p-8 border border-ink/15 text-center space-y-2">
              <Box className="w-8 h-8 mx-auto opacity-50" aria-hidden="true" />
              <p className="text-sm font-bold">
                {isKo
                  ? '왼쪽에서 바코드를 조회하거나 데모 프리셋을 선택해 주세요.'
                  : 'Scan a barcode or select a demo preset on the left to inspect and receive stock.'}
              </p>
              <p className="text-xs ss-muted max-w-md mx-auto">
                {isKo
                  ? 'GS1 2D 코드는 소비기한과 배치번호를 자동 추출하며, 미등록 바코드는 최초 1회 상품 등록 후 즉시 입고됩니다.'
                  : 'GS1 2D payloads extract 소비기한 (use-by date) and batch number; unknown barcodes trigger one-time registration.'}
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Lookup Header & Badges */}
              <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-ink/15">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="ss-chip ss-chip-ok tabular-nums">
                    {lookupResult.barcode}
                  </span>
                  {lookupResult.is_gs1 && (
                    <span className="ss-chip ss-chip-info">
                      GS1 2D (AI 01/17/10)
                    </span>
                  )}
                  <span className={`ss-chip ${lookupResult.ean13_valid ? 'ss-chip-ok' : 'ss-chip-critical'}`}>
                    {lookupResult.ean13_valid ? (
                      <>
                        <CheckCircle2 aria-hidden="true" />
                        <span>EAN-13 OK</span>
                      </>
                    ) : (
                      <>
                        <AlertTriangle aria-hidden="true" />
                        <span>Invalid EAN-13</span>
                      </>
                    )}
                  </span>
                </div>

                {/* Tier Badge */}
                <div>
                  {lookupResult.product?.source === 'internal' && (
                    <span className="ss-chip ss-chip-ok">
                      {isKo ? '1단계: 매장 등록 상품 (Internal DB)' : 'Tier 1: Internal DB product'}
                    </span>
                  )}
                  {lookupResult.product?.source === 'public_api' && (
                    <span className="ss-chip ss-chip-info">
                      {isKo ? '2단계: 공공 식품 API 조회됨 (Public API)' : 'Tier 2: Public food API match'}
                    </span>
                  )}
                  {!lookupResult.product && (
                    <span className="ss-chip ss-chip-attention">
                      <AlertTriangle aria-hidden="true" />
                      {isKo ? '3단계: 미등록 바코드 (1회 등록 필요)' : 'Tier 3: Unknown barcode (register once)'}
                    </span>
                  )}
                </div>
              </div>

              {/* Case A: Unknown Barcode OR Unregistered Public API -> One-Time Registration Form */}
              {(!lookupResult.product || lookupResult.product.source === 'public_api') && (
                <form onSubmit={handleRegisterProduct} className="border border-ink p-4 space-y-4">
                  <div className="flex items-center gap-2 font-bold text-sm">
                    <PlusCircle className="w-4 h-4" aria-hidden="true" />
                    <span>
                      {lookupResult.product?.source === 'public_api'
                        ? isKo
                          ? '공공 API 상품 확인: 매장 식자재 매핑 및 1회 등록'
                          : 'Public API product found: map ingredient & register once'
                        : isKo
                        ? '미등록 바코드: 최초 1회 상품 등록 (이후 자동 인식)'
                        : 'Barcode not found. Register the product once to scan it next time.'}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="ss-label">
                        {isKo ? '상품명 (국문)' : 'Product name (KO)'}
                      </label>
                      <input
                        type="text"
                        required
                        value={regNameKo}
                        onChange={e => setRegNameKo(e.target.value)}
                        placeholder="예: 강원 고랭지 절임배추 10kg"
                        className="ss-input w-full"
                      />
                    </div>
                    <div>
                      <label className="ss-label">
                        {isKo ? '상품명 (영문)' : 'Product name (EN)'}
                      </label>
                      <input
                        type="text"
                        required
                        value={regNameEn}
                        onChange={e => setRegNameEn(e.target.value)}
                        placeholder="e.g., Gangwon Salted Cabbage 10kg"
                        className="ss-input w-full"
                      />
                    </div>
                    <div>
                      <label className="ss-label">
                        {isKo ? '제조사 / 브랜드' : 'Maker / brand'}
                      </label>
                      <input
                        type="text"
                        required
                        value={regMaker}
                        onChange={e => setRegMaker(e.target.value)}
                        placeholder="예: 평창영농조합"
                        className="ss-input w-full"
                      />
                    </div>
                    <div>
                      <label className="ss-label">
                        {isKo ? '연결할 매장 핵심 식자재' : 'Link to core ingredient'}
                      </label>
                      <select
                        value={regIngredientId}
                        onChange={e => setRegIngredientId(Number(e.target.value))}
                        className="ss-input w-full"
                      >
                        {ingredients.map(ing => (
                          <option key={ing.id} value={ing.id}>
                            {isKo ? `${ing.name_ko} (${ing.unit})` : `${ing.name_en} (${ing.unit})`}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="ss-label">
                        {isKo ? '포장 규격 (수량 & 단위)' : 'Pack size & unit'}
                      </label>
                      <div className="flex gap-2">
                        <input
                          type="number"
                          step="0.1"
                          required
                          value={regPackSize}
                          onChange={e => setRegPackSize(Number(e.target.value))}
                          className="ss-input w-2/3 tabular-nums"
                        />
                        <input
                          type="text"
                          required
                          value={regUnit}
                          onChange={e => setRegUnit(e.target.value)}
                          className="ss-input w-1/3"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="ss-label">
                        {isKo ? '표준 소비기한 (일수)' : 'Standard shelf life (days)'}
                      </label>
                      <input
                        type="number"
                        required
                        value={regShelfLife}
                        onChange={e => setRegShelfLife(Number(e.target.value))}
                        className="ss-input w-full tabular-nums"
                      />
                    </div>
                  </div>

                  <div className="flex justify-end">
                    <button
                      type="submit"
                      className="ss-btn ss-btn-primary"
                    >
                      {isKo ? '상품 1회 등록 및 입고 진행' : 'Register product & receive'}
                    </button>
                  </div>
                </form>
              )}

              {/* Case B: Registered Product -> Lot Receiving & Incoming Order Match Form */}
              {lookupResult.product && lookupResult.product.source === 'internal' && (
                <form onSubmit={handleReceiveLot} className="space-y-4">
                  {/* Product Summary Tile */}
                  <div className="ss-tile flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div>
                      <p className="text-base font-bold">
                        {isKo ? lookupResult.product.name_ko : lookupResult.product.name_en}
                      </p>
                      <p className="ss-meta">
                        {lookupResult.product.maker} / {lookupResult.product.food_type} /{' '}
                        {isKo ? '매핑 식자재: ' : 'Ingredient: '}
                        <strong className="text-ink">
                          {isKo ? lookupResult.product.ingredient_name_ko : lookupResult.product.ingredient_name_en}
                        </strong>
                      </p>
                    </div>
                    <span className="ss-chip ss-chip-ok tabular-nums">
                      {isKo ? '기본 규격:' : 'Pack:'} {lookupResult.product.pack_size} {lookupResult.product.unit}
                    </span>
                  </div>

                  {/* Incoming Order Match Banner */}
                  {lookupResult.incoming_order && (
                    <div className="space-y-2">
                      <div className="ss-note justify-between">
                        <span className="text-xs font-bold inline-flex items-center gap-1.5">
                          <PackageCheck className="w-4 h-4" aria-hidden="true" />
                          <span>
                            {isKo
                              ? `입고 예정 발주 매칭됨 (Order #${lookupResult.incoming_order.id})`
                              : `Matched incoming order #${lookupResult.incoming_order.id}`}
                          </span>
                        </span>
                        <span className="text-xs font-bold tabular-nums">
                          {isKo ? '발주 수량:' : 'Ordered:'}{' '}
                          {lookupResult.incoming_order.approved_qty ?? lookupResult.incoming_order.recommended_qty}{' '}
                          {lookupResult.product.unit}
                        </span>
                      </div>

                      {discrepancyInfo.hasDiscrepancy && (
                        <div className="ss-note ss-note-attention">
                          <AlertTriangle className="w-4 h-4 text-signal" aria-hidden="true" />
                          <span className="text-xs">
                            {isKo
                              ? `수량 차이 감지: 발주 ${discrepancyInfo.expectedQty} ${lookupResult.product.unit} vs 입고 입력 ${receiveQty} ${lookupResult.product.unit} (차이 ${discrepancyInfo.diff > 0 ? '+' : ''}${discrepancyInfo.diff} ${lookupResult.product.unit}) — 감사 로그에 자동 기록됩니다.`
                              : `Quantity discrepancy: ordered ${discrepancyInfo.expectedQty} vs receiving ${receiveQty} (${discrepancyInfo.diff > 0 ? '+' : ''}${discrepancyInfo.diff}) — logged in audit log.`}
                          </span>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Receiving Fields */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="ss-label">
                        {isKo ? `입고 수량 (${lookupResult.product.unit})` : `Receiving quantity (${lookupResult.product.unit})`}
                      </label>
                      <input
                        type="number"
                        step="0.1"
                        required
                        value={receiveQty}
                        onChange={e => setReceiveQty(Number(e.target.value))}
                        className="ss-input w-full tabular-nums font-bold"
                      />
                    </div>

                    <div>
                      <label className="ss-label">
                        {isKo ? '단가 (₩ / 단위)' : 'Unit cost (₩ / unit)'}
                      </label>
                      <input
                        type="number"
                        required
                        value={receiveUnitCost}
                        onChange={e => setReceiveUnitCost(Number(e.target.value))}
                        className="ss-input w-full tabular-nums"
                      />
                    </div>

                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="ss-label mb-0">
                          {isKo ? '소비기한 (Use-by date)' : '소비기한 (use-by date)'}
                        </label>
                        <span className="ss-chip ss-chip-info">
                          {receiveSource === 'auto'
                            ? isKo ? 'GS1 자동 (auto)' : 'GS1 auto'
                            : receiveSource === 'estimated'
                            ? isKo ? '표준기한 추정 (estimated)' : 'Estimated'
                            : receiveSource === 'photo'
                            ? isKo ? '사진 스텁 (photo)' : 'Photo stub'
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
                        className="ss-input w-full tabular-nums"
                      />
                    </div>

                    <div>
                      <label className="ss-label">
                        {isKo ? '배치 / 로트 번호' : 'Batch / lot number'}
                      </label>
                      <input
                        type="text"
                        value={receiveBatch}
                        onChange={e => setReceiveBatch(e.target.value)}
                        className="ss-input w-full tabular-nums"
                      />
                    </div>
                  </div>

                  {/* Expiry Label Photo OCR Stub Upload + Submit */}
                  <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                    <label className="ss-btn ss-btn-secondary ss-btn-sm">
                      <Upload className="w-4 h-4" aria-hidden="true" />
                      <span>{isKo ? '소비기한 라벨 사진 업로드 (OCR 스텁)' : 'Upload 소비기한 photo (OCR stub)'}</span>
                      <input type="file" accept="image/*" onChange={handleOcrPhotoUpload} className="hidden" />
                    </label>

                    <button
                      type="submit"
                      className="ss-btn ss-btn-primary"
                    >
                      {isKo ? '로트 입고 확정 (FEFO 등록)' : 'Receive lot into stock'}
                    </button>
                  </div>

                  {ocrMessage && (
                    <div className="ss-note ss-note-attention">
                      <CheckCircle2 className="w-4 h-4 text-signal" aria-hidden="true" />
                      <span>{ocrMessage}</span>
                    </div>
                  )}

                  {receiveSuccessMsg && (
                    <div className="ss-note ss-note-attention">
                      <CheckCircle2 className="w-4 h-4 text-signal" aria-hidden="true" />
                      <div>
                        <p className="font-bold">{receiveSuccessMsg}</p>
                        {receiveDiscrepancyMsg && (
                          <p className="text-xs ss-muted mt-1">{receiveDiscrepancyMsg}</p>
                        )}
                      </div>
                    </div>
                  )}
                </form>
              )}
            </div>
          )}
        </section>
      </div>

      {/* M4: Supplier-Window Expiry-Risk Simulation & Physical Spot Count */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Left 7 cols: Expiry-Risk Simulation & FEFO Depletion Simulator */}
        <section className="lg:col-span-7 ss-section space-y-4">
          <div className="ss-section-title justify-between flex-wrap">
            <span>
              {isKo
                ? '공급 주기별 소비기한 만료 위험 & FEFO 소진 시뮬레이터'
                : 'Supplier-window 소비기한 risk & FEFO simulator'}
            </span>
            <div className="inline-flex border border-ink font-normal">
              {[3, 5, 7].map(d => {
                const active = coverageDays === d;
                return (
                  <button
                    key={d}
                    type="button"
                    onClick={() => {
                      setCoverageDays(d);
                      fetchAllInventoryData(d);
                    }}
                    className={`px-2.5 py-1 text-xs font-bold cursor-pointer ${
                      active ? 'bg-ink text-paper' : 'bg-paper text-ink hover:bg-ink/5'
                    }`}
                  >
                    {isKo ? `${d}일 주기` : `${d}d window`}
                  </button>
                );
              })}
            </div>
          </div>

          <p className="text-sm ss-muted">
            {isKo
              ? '사용 기간 전에 소비기한이 만료되는 로트(예: 앞다리살 Lot A 4.0 kg)는 가용 재고에서 자동 제외됩니다.'
              : 'Lots expiring before the supplier use window ends (e.g., Pork Lot A 4.0 kg) are excluded as at-risk.'}
          </p>

          {/* At-Risk Ingredients Highlight Table */}
          <div className="ss-table-wrap">
            <table className="ss-table">
              <thead>
                <tr>
                  <th>{isKo ? '식자재' : 'Ingredient'}</th>
                  <th className="ss-num">{isKo ? '장부 총재고' : 'Total on-hand'}</th>
                  <th className="ss-num">{isKo ? '가용 재고' : 'Usable'}</th>
                  <th className="ss-num">{isKo ? '만료위험 제외' : 'At-risk excluded'}</th>
                  <th className="ss-num">{isKo ? '위험 금액' : 'At-risk (₩)'}</th>
                </tr>
              </thead>
              <tbody>
                {expiryRisks.slice(0, 6).map(r => (
                  <tr key={r.ingredient_id} className={r.at_risk_qty > 0 ? 'ss-row-critical' : ''}>
                    <td className="font-bold">
                      {isKo ? r.name_ko : r.name_en}
                    </td>
                    <td className="ss-num">
                      {r.total_on_hand_qty} {r.unit}
                    </td>
                    <td className="ss-num font-bold">
                      {r.usable_qty} {r.unit}
                    </td>
                    <td className="ss-num">
                      {r.at_risk_qty > 0 ? (
                        <span className="ss-chip ss-chip-critical">
                          <AlertTriangle aria-hidden="true" />
                          {r.at_risk_qty} {r.unit}
                        </span>
                      ) : '-'}
                    </td>
                    <td className="ss-num">
                      {r.at_risk_value_krw > 0 ? `₩${r.at_risk_value_krw.toLocaleString()}` : '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Interactive FEFO Depletion Simulator */}
          <div className="pt-4 border-t border-ink/15 space-y-3">
            <p className="text-sm font-bold">
              {isKo ? 'FEFO 로트 차감 시뮬레이터 (소비기한 임박순)' : 'Interactive FEFO lot depletion simulator'}
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={depleteIngredientId}
                onChange={e => setDepleteIngredientId(Number(e.target.value))}
                className="ss-input"
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
                className="ss-input w-28 tabular-nums"
              />
              <button
                type="button"
                onClick={() => handleRunFefoSim(false)}
                className="ss-btn ss-btn-primary ss-btn-sm"
              >
                {isKo ? 'FEFO 소진 시뮬레이션' : 'Simulate FEFO depletion'}
              </button>
            </div>

            {depleteSimResult && (
              <div className="ss-note flex-col items-start">
                <p className="font-bold text-sm tabular-nums">
                  {isKo
                    ? `요청 수요 ${depleteSimResult.requested_demand_qty} → 총 차감 ${depleteSimResult.total_depleted_qty} (부족분: ${depleteSimResult.unmet_shortfall_qty})`
                    : `Demand ${depleteSimResult.requested_demand_qty} → Depleted ${depleteSimResult.total_depleted_qty} (Shortfall: ${depleteSimResult.unmet_shortfall_qty})`}
                </p>
                <div className="flex flex-wrap gap-2 pt-1">
                  {depleteSimResult.updated_lots?.map((u: any) => (
                    <span key={u.id} className="ss-chip ss-chip-ok tabular-nums">
                      {u.batch_number || `Lot #${u.id}`} ({u.expiry_date}): −{u.depleted_qty} → {u.remaining_qty} ({u.status_after})
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </section>

        {/* Right 5 cols: Physical Spot Count Adjustment */}
        <section className="lg:col-span-5 ss-section space-y-4">
          <h2 className="ss-section-title">
            {isKo ? '현장 실사 및 재고 차이 조정 (Spot count)' : 'Physical spot count & variance'}
          </h2>
          <p className="text-sm ss-muted">
            {isKo
              ? '실사 수량 입력 시 장부 재고와의 차이를 FEFO 순서로 조정하고 감사 로그에 기록합니다.'
              : 'Adjusts active lots in FEFO order to match physical count and logs variance in the audit log.'}
          </p>

          <form onSubmit={handleSpotCountSubmit} className="space-y-4">
            <div>
              <label className="ss-label">
                {isKo ? '실사 대상 식자재' : 'Ingredient'}
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
                className="ss-input w-full"
              >
                {ingredients.map(ing => (
                  <option key={ing.id} value={ing.id}>
                    {isKo ? `${ing.name_ko} (${ing.unit})` : `${ing.name_en} (${ing.unit})`}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3 items-end">
              <div className="ss-tile p-3">
                <p className="ss-meta">{isKo ? '현재 장부상 재고' : 'System on-hand'}</p>
                <p className="text-lg font-bold tabular-nums mt-0.5">
                  {selectedSpotSystemQty} {selectedSpotIng?.unit || 'kg'}
                </p>
              </div>
              <div>
                <label className="ss-label">
                  {isKo ? `실제 실사 수량 (${selectedSpotIng?.unit || 'kg'})` : `Physical count (${selectedSpotIng?.unit || 'kg'})`}
                </label>
                <input
                  type="number"
                  step="0.1"
                  required
                  value={spotCountedQty}
                  onChange={e => setSpotCountedQty(Number(e.target.value))}
                  className="ss-input w-full font-bold tabular-nums"
                />
              </div>
            </div>

            <div className="ss-note justify-between">
              <span className="text-xs font-bold">{isKo ? '예상 재고 차이 (Variance):' : 'Projected variance:'}</span>
              <span className="font-bold text-xs tabular-nums">
                {spotPreview.varianceQty > 0 ? '+' : ''}
                {spotPreview.varianceQty} {selectedSpotIng?.unit || 'kg'} (₩{spotPreview.varianceKrw.toLocaleString()})
              </span>
            </div>

            <div>
              <label className="ss-label">
                {isKo ? '실사 조정 사유' : 'Adjustment reason'}
              </label>
              <input
                type="text"
                required
                value={spotReason}
                onChange={e => setSpotReason(e.target.value)}
                className="ss-input w-full"
              />
            </div>

            <button
              type="submit"
              className="ss-btn ss-btn-primary w-full"
            >
              {isKo ? '실사 수량 저장' : 'Save count'}
            </button>

            {spotResultMsg && (
              <div className="ss-note ss-note-attention">
                <CheckCircle2 className="w-4 h-4 text-signal" aria-hidden="true" />
                <span>{spotResultMsg}</span>
              </div>
            )}
          </form>
        </section>
      </div>

      {/* Active Stock Table (FEFO Ordered) */}
      <section className="ss-section">
        <div className="ss-section-title justify-between flex-wrap">
          <span>
            {isKo ? '가용 재고 로트 테이블 (FEFO: 소비기한 임박순)' : 'Active stock lots (FEFO order by 소비기한)'}
          </span>

          <div className="flex flex-wrap items-center gap-2 font-normal">
            <div className="relative">
              <Search className="w-4 h-4 absolute left-2.5 top-3 opacity-60" aria-hidden="true" />
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder={isKo ? '식자재 / 배치 검색...' : 'Search ingredient or batch...'}
                className="ss-input pl-8 text-xs"
              />
            </div>

            <div className="inline-flex border border-ink">
              {(['all', 'urgent', 'warning', 'good'] as const).map(st => {
                const active = statusFilter === st;
                return (
                  <button
                    key={st}
                    type="button"
                    onClick={() => setStatusFilter(st)}
                    className={`px-2.5 py-2 text-xs font-bold cursor-pointer ${
                      active ? 'bg-ink text-paper' : 'bg-paper text-ink hover:bg-ink/5'
                    }`}
                  >
                    {st === 'all'
                      ? isKo ? '전체' : 'All'
                      : st === 'urgent'
                      ? isKo ? '긴급 (≤2일)' : 'Urgent (≤2d)'
                      : st === 'warning'
                      ? isKo ? '주의 (3~5일)' : 'Warning (3–5d)'
                      : isKo ? '양호 (>5일)' : 'Good (>5d)'}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <p className="text-sm ss-muted mb-4">
          {isKo
            ? '모든 재고는 소비기한(Use-by date)이 가장 빠른 로트부터 먼저 소진(FEFO)됩니다.'
            : 'All lots are depleted in strict First-Expired, First-Out (FEFO) order based on 소비기한.'}
        </p>

        {loadingLots ? (
          <div className="p-8 border border-ink/15 text-center text-sm ss-muted">
            {isKo ? '재고 로트 불러오는 중...' : 'Loading inventory lots...'}
          </div>
        ) : (
          <div className="ss-table-wrap">
            <table className="ss-table">
              <thead>
                <tr>
                  <th>{isKo ? 'FEFO 순위' : 'FEFO #'}</th>
                  <th>{isKo ? '식자재명' : 'Ingredient'}</th>
                  <th>{isKo ? '배치 번호' : 'Batch'}</th>
                  <th className="ss-num">{isKo ? '현재 잔량' : 'On-hand qty'}</th>
                  <th>{isKo ? '입고일' : 'Received'}</th>
                  <th>{isKo ? '소비기한 (Use-by)' : '소비기한 (use-by)'}</th>
                  <th>{isKo ? '잔여일 / 상태' : 'Days left'}</th>
                  <th>{isKo ? '인식 출처' : 'Source'}</th>
                  <th className="ss-num">{isKo ? '로트 금액' : 'Lot value'}</th>
                </tr>
              </thead>
              <tbody>
                {filteredLots.map((lot, idx) => {
                  const isCritical = lot.expiry_status === 'expired' || lot.expiry_status === 'urgent';
                  const chipClass = isCritical
                    ? 'ss-chip-critical'
                    : lot.expiry_status === 'warning'
                    ? 'ss-chip-attention'
                    : 'ss-chip-ok';

                  return (
                    <tr
                      key={lot.id}
                      className={isCritical ? 'ss-row-critical' : idx === 0 ? 'ss-row-selected' : ''}
                    >
                      <td className="tabular-nums ss-muted">
                        #{idx + 1}
                        {idx === 0 && (
                          <span className="ss-chip ss-chip-info ml-2">
                            {isKo ? '우선 출고' : 'Use first'}
                          </span>
                        )}
                      </td>
                      <td className="font-bold">
                        {isKo ? lot.ingredient_name_ko : lot.ingredient_name_en}
                        {lot.product_name_ko && (
                          <p className="text-xs font-normal ss-muted">
                            {isKo ? lot.product_name_ko : lot.product_name_en}
                          </p>
                        )}
                      </td>
                      <td className="tabular-nums ss-muted">
                        {lot.batch_number || '-'}
                      </td>
                      <td className="ss-num font-bold">
                        {lot.quantity} {lot.unit}
                        <span className="text-xs font-normal ss-muted ml-1">
                          / {lot.original_quantity}
                        </span>
                      </td>
                      <td className="tabular-nums ss-muted">{lot.received_date}</td>
                      <td className="tabular-nums font-bold">
                        {lot.expiry_date}
                      </td>
                      <td>
                        <span className={`ss-chip ${chipClass}`}>
                          {isCritical && <ShieldAlert aria-hidden="true" />}
                          <span>
                            {lot.days_until_expiry < 0
                              ? isKo ? `만료 (${lot.days_until_expiry}일)` : `Expired (${lot.days_until_expiry}d)`
                              : `D-${lot.days_until_expiry}`}
                          </span>
                        </span>
                      </td>
                      <td>
                        <span className="ss-chip ss-chip-ok">
                          {lot.source}
                        </span>
                      </td>
                      <td className="ss-num">
                        ₩{Math.round(lot.quantity * lot.unit_cost_krw).toLocaleString()}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
