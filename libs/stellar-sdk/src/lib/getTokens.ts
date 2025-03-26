import { RECEIVER } from '../constants/routes';
import { ar, as } from './axios/axiosGuest';

export const getAuthToken = async (
  tenant_name: string,
  receiver_public_key: string
) => {
  const home_domain = RECEIVER.HOME_DOMAIN(tenant_name);
  const account = await ar.get(RECEIVER.AUTH, {
    params: {
      account: receiver_public_key,
      home_domain,
      client_domain: RECEIVER.CLIENT_DOMAIN,
    },
  });
  const sign = await as.post(RECEIVER.SIGN, account.data);
  return ar.post(RECEIVER.AUTH, {
    transaction: sign.data.transaction,
  });
};

export const interactive_url = async (
  receiver_public_key: string,
  token: string
) => {
  const formdata = new FormData();

  formdata.append('asset_code', 'RAHAT');
  formdata.append('account', receiver_public_key);
  formdata.append('claimable_balance_supported', 'false');
  formdata.append('lang', 'en');

  return ar.post(RECEIVER.INTERACTIVE, formdata, {
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type':
        'multipart/form-data; boundary=----WebKitFormBoundaryAwgapqx3AgKQPQe0',
    },
  });
};
