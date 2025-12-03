require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const search = process.argv[2] || '9933906926';

supabase.from('users')
  .select('phone_number, name, lead_status, lead_score')
  .ilike('phone_number', '%' + search + '%')
  .then(r => {
    console.log('Usuarios que contienen "' + search + '":');
    if (r.data && r.data.length > 0) {
      r.data.forEach(u => {
        console.log('  ' + u.phone_number + ' - ' + (u.name || 'Sin nombre') + ' (score:' + u.lead_score + ', ' + u.lead_status + ')');
      });
    } else {
      console.log('  Ninguno encontrado');
    }
  });
