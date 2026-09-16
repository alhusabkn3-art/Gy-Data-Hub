function PinChangeModal({
  type,
  verifyLoginPin,
  changeLoginPin,
  verifyPurchasePin,
  changePurchasePin,
  purchasePinConfigured,
  onClose,
}: {
  type: 'login' | 'purchase';
  verifyLoginPin: (pin: string) => Promise<boolean>;
  changeLoginPin: (
    currentPin: string,
    newPin: string,
  ) => Promise<{
    ok: boolean;
    error?: string;
  }>;
  verifyPurchasePin: (
    purchasePin: string,
  ) => Promise<boolean>;
  changePurchasePin: (
    currentPurchasePin: string,
    newPurchasePin: string,
  ) => Promise<{
    ok: boolean;
    error?: string;
  }>;
  purchasePinConfigured: boolean;
  onClose: () => void;
}) {
  const isFirstPurchaseSetup =
    type === 'purchase' && !purchasePinConfigured;

  const [step, setStep] = useState<
    'current' | 'new' | 'confirm'
  >(
    isFirstPurchaseSetup
      ? 'new'
      : 'current',
  );

  const [currentPin, setCurrentPin] =
    useState('');

  const [newPin, setNewPin] =
    useState('');

  const [confirmPin, setConfirmPin] =
    useState('');

  const [showPin, setShowPin] =
    useState(false);

  const [isWorking, setIsWorking] =
    useState(false);

  const label =
    type === 'login'
      ? 'Login'
      : 'Purchase';

  const pinLength =
    type === 'purchase'
      ? 4
      : 6;

  const activePin =
    step === 'current'
      ? currentPin
      : step === 'new'
        ? newPin
        : confirmPin;

  const handleKeyPress = async (
    key: string,
  ) => {
    if (isWorking) return;

    if (
      key !== 'backspace' &&
      !/^\d$/.test(key)
    ) {
      return;
    }

    const setter =
      step === 'current'
        ? setCurrentPin
        : step === 'new'
          ? setNewPin
          : setConfirmPin;

    const current =
      step === 'current'
        ? currentPin
        : step === 'new'
          ? newPin
          : confirmPin;

    if (key === 'backspace') {
      setter(current.slice(0, -1));
      return;
    }

    if (current.length >= pinLength) {
      return;
    }

    const next =
      current + key;

    if (!/^\d*$/.test(next)) {
      return;
    }

    setter(next);

    if (next.length !== pinLength) {
      return;
    }

    await new Promise(resolve =>
      setTimeout(resolve, 250),
    );

    if (step === 'current') {
      setIsWorking(true);

      const ok =
        type === 'purchase'
          ? await verifyPurchasePin(next)
          : await verifyLoginPin(next);

      setIsWorking(false);

      if (!ok) {
        toast.error(
          `Incorrect current ${label.toLowerCase()} PIN.`,
        );
        setter('');
        return;
      }

      setStep('new');
      return;
    }

    if (step === 'new') {
      setStep('confirm');
      return;
    }

    if (next !== newPin) {
      toast.error(
        "PINs don't match. Try again.",
      );

      setConfirmPin('');
      setStep('new');
      setNewPin('');
      return;
    }

    setIsWorking(true);

    const result =
      type === 'purchase'
        ? await changePurchasePin(
            isFirstPurchaseSetup
              ? ''
              : currentPin,
            newPin,
          )
        : await changeLoginPin(
            currentPin,
            newPin,
          );

    setIsWorking(false);

    if (result.ok) {
      toast.success(
        isFirstPurchaseSetup
          ? 'Purchase PIN set successfully!'
          : `${label} PIN changed successfully!`,
      );

      onClose();
      return;
    }

    toast.error(
      result.error ??
        'Failed to update PIN.',
    );

    setCurrentPin('');
    setNewPin('');
    setConfirmPin('');

    setStep(
      isFirstPurchaseSetup
        ? 'new'
        : 'current',
    );
  };

  const keys = [
    '1',
    '2',
    '3',
    '4',
    '5',
    '6',
    '7',
    '8',
    '9',
    '',
    '0',
    'backspace',
  ];

  const stepLabel =
    step === 'current'
      ? `Enter Current ${label} PIN`
      : step === 'new'
        ? `Enter New ${label} PIN`
        : 'Confirm New PIN';

  const totalSteps =
    isFirstPurchaseSetup
      ? 2
      : 3;

  const currentStepNumber =
    isFirstPurchaseSetup
      ? step === 'new'
        ? 1
        : 2
      : step === 'current'
        ? 1
        : step === 'new'
          ? 2
          : 3;

  return (
    <>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/60 z-50 backdrop-blur-sm"
        onClick={onClose}
      />

      <motion.div
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{
          type: 'spring',
          damping: 25,
          stiffness: 200,
        }}
        className="fixed bottom-0 left-0 right-0 bg-white border-t border-border shadow-2xl z-50 rounded-t-3xl max-w-md mx-auto p-6 pb-8"
      >
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-bold">
            {isFirstPurchaseSetup
              ? 'Set Purchase PIN'
              : `Change ${label} PIN`}
          </h2>

          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-black/5 flex items-center justify-center"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <p className="text-sm text-muted-foreground text-center mb-4">
          {stepLabel}
        </p>

        <div className="flex justify-center gap-2 mb-6">
          {Array.from({
            length: pinLength,
          }).map((_, i) => (
            <div
              key={i}
              className={`w-10 h-10 rounded-xl flex items-center justify-center border-2 ${
                i === activePin.length
                  ? 'border-primary bg-primary/10'
                  : i < activePin.length
                    ? 'border-primary bg-primary'
                    : 'border-border bg-muted'
              }`}
            >
              {i < activePin.length &&
                (showPin ? (
                  <span className="text-primary-foreground text-sm font-bold">
                    {activePin[i]}
                  </span>
                ) : (
                  <div className="w-2.5 h-2.5 bg-primary-foreground rounded-full" />
                ))}
            </div>
          ))}
        </div>

        {isWorking && (
          <p className="text-xs text-center text-muted-foreground mb-2">
            Verifying…
          </p>
        )}

        <div className="grid grid-cols-3 gap-2 mb-4">
          {keys.map((key, i) => (
            <button
              key={i}
              type="button"
              disabled={!key || isWorking}
              onClick={() => {
                if (key) {
                  void handleKeyPress(key);
                }
              }}
              className={`h-12 rounded-xl flex items-center justify-center text-lg font-medium ${
                key
                  ? 'bg-muted hover:bg-black/10 active:scale-95'
                  : 'opacity-0'
              }`}
            >
              {key === 'backspace' ? (
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M21 4H8l-7 8 7 8h13a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2z" />
                  <line
                    x1="18"
                    y1="9"
                    x2="12"
                    y2="15"
                  />
                  <line
                    x1="12"
                    y1="9"
                    x2="18"
                    y2="15"
                  />
                </svg>
              ) : (
                key
              )}
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={() =>
            setShowPin(value => !value)
          }
          className="w-full flex items-center justify-center gap-2 text-xs text-muted-foreground py-2"
        >
          {showPin ? (
            <EyeOff className="w-3.5 h-3.5" />
          ) : (
            <Eye className="w-3.5 h-3.5" />
          )}

          {showPin
            ? 'Hide PIN'
            : 'Show PIN'}
        </button>

        {type === 'purchase' && (
          <p className="text-center text-xs text-muted-foreground mt-2">
            Purchase PIN must contain 4 digits.
          </p>
        )}

        <p className="text-center text-xs text-muted-foreground mt-2">
          Step {currentStepNumber} of {totalSteps}
        </p>
      </motion.div>
    </>
  );
}
