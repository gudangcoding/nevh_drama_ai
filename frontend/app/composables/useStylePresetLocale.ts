/**
 * Lokalisasi nama/deskripsi style preset berdasarkan locale.
 * Seed presets memiliki nama/deskripsi Tiongkok; mapping statis ini menerjemahkannya
 * ke bahasa lokal tanpa mengubah data di database (termasuk untuk preset buatan pengguna).
 */
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

const STYLE_PRESET_LOCALE: Record<string, { name?: string; desc?: string }> = {
  '3d': { name: 'Manga 3D', desc: 'Render 3D kelas game engine, karakter semi-realistis, estetika manga 3D drama pendek mainstream' },
  anime: { name: 'Anime Cel', desc: 'Gaya animasi cel Jepang' },
  ghibli: { name: 'Ghibli Lukis Tangan', desc: 'Gaya lukis tangan Studio Ghibli yang menenangkan' },
  watercolor: { name: 'Cat Air', desc: 'Estetika ilustrasi cat air' },
  comic: { name: 'Komik Barat', desc: 'Gaya garis tebal komik barat' },
  guofeng: { name: 'Guofeng 2.5D', desc: 'Estetika animasi Tiongkok / drama xianxia, semi-realistis 2.5D' },
  webtoon: { name: 'Webtoon Korea', desc: 'Gaya pewarnaan halus webtoon Korea' },
  noir: { name: 'Noir Manga', desc: 'Manga noir hitam-putih, gaya tinta kontras tinggi' },
  indo_modern: { name: 'Film Indonesia Modern', desc: 'Nuansa film drama perkotaan Indonesia modern, realistis, gaya sinematik kontemporer' },
  indo_classic: { name: 'Film Indonesia Klasik', desc: 'Nuansa film klasik Indonesia era 70-80an, gaya film vintage yang nostalgik' },
  indo_epic: { name: 'Film Indonesia Kolosal', desc: 'Epos sejarah Indonesia berskala besar, kerajaan, istana, dan perang yang megah' },
  indo_sinetron: { name: 'Sinetron Remaja', desc: 'Drama sinetron remaja kota Indonesia, cerah, romantis, estetika modern kontemporer' },
  indo_horor: { name: 'Horor Nusantara', desc: 'Horor/mistis folklore Indonesia: kuntilanak, hutan gelap, ritual, nuansa tegang gelap' },
  indo_perjuangan: { name: 'Perjuangan Kemerdekaan', desc: 'Era perjuangan kemerdekaan Indonesia 1945, seragam perjuangan, bambu runcing, nuansa heroik' },
}

export function useStylePresetLocale() {
  const { locale } = useI18n()

  const isIndonesian = computed(() => locale.value === 'id')

  function presetName(p: { value?: string; name?: string }) {
    if (!isIndonesian.value || !p.value) return p.name || ''
    return STYLE_PRESET_LOCALE[p.value]?.name || p.name || ''
  }

  function presetDesc(p: { value?: string; description?: string }) {
    if (!isIndonesian.value || !p.value) return p.description || ''
    return STYLE_PRESET_LOCALE[p.value]?.desc || p.description || ''
  }

  return { presetName, presetDesc }
}
