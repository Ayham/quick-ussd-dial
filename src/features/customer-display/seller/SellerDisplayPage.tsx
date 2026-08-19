import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import { toast } from 'sonner';
import { MonitorSmartphone, Wifi, WifiOff, Loader2, StopCircle, RefreshCw, CheckCircle, XCircle, Copy, Check, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useCustomerDisplayServer } from './CustomerDisplayServerProvider';
import { detectOperator } from '@/lib/ussd-profiles';

export default function SellerDisplayPage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const isArabic = i18n.language === 'ar';

  const {
    serverRunning, loading, customerConnected, pendingRequest, qrData,
    serverIp, serverPort, startServer, stopServer, regenerateQr, approveRequest, rejectRequest,
  } = useCustomerDisplayServer();

  const [copied, setCopied] = useState(false);

  const handleCopyConnectionInfo = async () => {
    if (!qrData) return;
    try {
      await navigator.clipboard.writeText(qrData);
      setCopied(true);
      toast.success(t('customerDisplay.seller.connectionInfoCopied'));
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error(t('customerDisplay.seller.copyFailed'));
    }
  };

  const handleApprove = () => {
    const req = approveRequest();
    if (!req) return;
    navigate('/', {
      state: {
        customerTransferRequest: {
          requestId: req.requestId,
          phone: req.phone,
          amount: req.amount,
          price: req.price,
        },
      },
      replace: true,
    });
  };

  const getOperatorBadge = (phone: string) => {
    const op = detectOperator(phone);
    if (!op) return null;
    return (
      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${
        op === 'mtn' ? 'bg-blue-100 text-blue-700' : 'bg-orange-100 text-orange-700'
      }`}>
        {op === 'mtn' ? 'MTN' : t('operator.syriatel')}
      </span>
    );
  };

  return (
    <div className="min-h-dvh bg-background" dir={isArabic ? 'rtl' : 'ltr'}>
      <div className="max-w-lg mx-auto p-4 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <MonitorSmartphone className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h1 className="text-lg font-bold">{t('customerDisplay.seller.title')}</h1>
              <p className="text-xs text-muted-foreground">{t('customerDisplay.seller.subtitle')}</p>
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={() => navigate('/')}>
            {t('common.back')}
          </Button>
        </div>

        {!serverRunning ? (
          <Card>
            <CardContent className="p-6 space-y-4">
              <div className="text-center space-y-2">
                <Wifi className="w-12 h-12 mx-auto text-muted-foreground" />
                <p className="text-sm text-muted-foreground">{t('customerDisplay.seller.description')}</p>
              </div>
              <Button
                onClick={startServer}
                disabled={loading}
                className="w-full h-12 rounded-xl font-bold"
              >
                {loading ? <Loader2 className="w-5 h-5 animate-spin me-2" /> : <Wifi className="w-5 h-5 me-2" />}
                {t('customerDisplay.seller.startServer')}
              </Button>
            </CardContent>
          </Card>
        ) : (
          <>
            <Card>
              <CardContent className="p-6 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className={`w-3 h-3 rounded-full ${customerConnected ? 'bg-green-500 animate-pulse' : 'bg-yellow-500'}`} />
                    <span className="text-sm font-medium">
                      {customerConnected
                        ? t('customerDisplay.seller.connected')
                        : t('customerDisplay.seller.waiting')}
                    </span>
                  </div>
                  <span className="text-[10px] text-muted-foreground font-mono">
                    {serverIp}:{serverPort}
                  </span>
                </div>

                <div className="flex justify-center py-2">
                  <div className="bg-white p-3 rounded-2xl shadow-sm border border-border/60">
                    <QRCodeSVG
                      value={qrData}
                      size={200}
                      level="M"
                      includeMargin={false}
                    />
                  </div>
                </div>

                <p className="text-center text-xs text-muted-foreground">
                  {t('customerDisplay.seller.scanQr')}
                </p>

                <Button
                  variant="outline"
                  onClick={handleCopyConnectionInfo}
                  className="w-full h-10 rounded-xl"
                  disabled={customerConnected}
                >
                  {copied ? <Check className="w-4 h-4 me-1" /> : <Copy className="w-4 h-4 me-1" />}
                  {copied ? t('customerDisplay.seller.copied') : t('customerDisplay.seller.copyConnectionInfo')}
                </Button>

                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    onClick={regenerateQr}
                    className="flex-1 h-10 rounded-xl"
                    disabled={customerConnected}
                  >
                    <RefreshCw className="w-4 h-4 me-1" />
                    {t('customerDisplay.seller.newQr')}
                  </Button>
                  <Button
                    variant="destructive"
                    onClick={stopServer}
                    className="flex-1 h-10 rounded-xl"
                  >
                    <StopCircle className="w-4 h-4 me-1" />
                    {t('customerDisplay.seller.stop')}
                  </Button>
                </div>
              </CardContent>
            </Card>

            {pendingRequest && (
              <Card className="border-blue-200 bg-blue-50/80 dark:bg-blue-950/20 animate-slide-up">
                <CardContent className="p-4 space-y-2">
                  <div className="flex items-center gap-2.5">
                    <div className="w-7 h-7 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center flex-shrink-0">
                      <Send className="w-4 h-4 text-blue-600 dark:text-blue-400 animate-pulse" />
                    </div>
                    <div className="flex-1">
                      <p className="text-xs font-semibold text-blue-800 dark:text-blue-300">
                        {t('customerDisplay.seller.pendingRequestCard')}
                      </p>
                      <p className="text-[10px] text-blue-600/80 dark:text-blue-400/80 mt-0.5">
                        {pendingRequest.phone} • {pendingRequest.amount.toLocaleString()} {t('common.currencySymbol')}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
          </>
        )}
      </div>
    </div>
  );
}
