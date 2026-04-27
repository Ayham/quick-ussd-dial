import { Preferences } from '@capacitor/preferences';
import { getNativeTrial } from './native-trial';

const TRIAL_GUARD_KEY = "_tg";

export async function getProtectedTrial(){

  const nativeTrial = await getNativeTrial();

  const stored = await Preferences.get({ key: TRIAL_GUARD_KEY });

  // أول تشغيل
  if(!stored.value){
    await Preferences.set({
      key: TRIAL_GUARD_KEY,
      value: JSON.stringify(nativeTrial)
    });
    return nativeTrial;
  }

  const saved = JSON.parse(stored.value);

  // كشف التلاعب
  if(nativeTrial.daysLeft > saved.daysLeft){
    return { status:"trial_expired" };
  }

  // تحديث الحالة
  await Preferences.set({
    key: TRIAL_GUARD_KEY,
    value: JSON.stringify(nativeTrial)
  });

  return nativeTrial;

}