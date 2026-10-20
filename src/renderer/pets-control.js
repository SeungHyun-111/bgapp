const checkbox = document.getElementById('above');
checkbox.checked = new URLSearchParams(location.search).get('above') !== 'false';
checkbox.addEventListener('change', () => window.petsAPI.setAbove(checkbox.checked));
